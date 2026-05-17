/**
 * WA Bridge v2 — Baileys-based WhatsApp Web session manager
 *
 * Uses @whiskeysockets/baileys (WebSocket, no Chromium required).
 * Works on shared hosting where Puppeteer/Chrome is unavailable.
 *
 * Endpoints:
 *   POST /session/start                    { sessionId }   → starts/reconnects a session
 *   GET  /session/:id/status               → { status, qr? }
 *   POST /session/stop                     { sessionId }   → destroys the session
 *   GET  /session/:id/contacts             → { contacts: [...] }
 *   GET  /session/:id/groups               → { groups: [...] }
 *   GET  /session/:id/newsletters          → { newsletters: [...] }
 *   POST /session/:id/newsletters          { jid?, inviteCode?, name? } → adds a channel
 *   DELETE /session/:id/newsletters/:jid   → removes a channel
 *   POST /send                             { sessionId, targetId, targetType, message }
 *
 * Session statuses: disconnected | connecting | connected
 * targetType values: contact | group | newsletter
 */

// Polyfill Web Crypto API for Node.js 18 (required by Baileys 6.7+; native in Node 19+)
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import baileys from '@whiskeysockets/baileys';
// CJS→ESM interop: default export is the module.exports object, not the function
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = baileys;
import pino from 'pino';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_DIR  = join(__dirname, '..', '.wwebjs_auth');
const PORT      = process.env.PORT || 3099;

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));

// Silent logger to suppress Baileys' verbose output
const silentLogger = pino({ level: 'silent' });

// ── In-memory session map ─────────────────────────────────────────────────────
// Map<sessionId, { socket, status, qrDataUrl, contacts, groups, reconnectTimer }>
const sessions = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSession(sessionId) {
  return sessions.get(sessionId) ?? null;
}

function sessionAuthPath(sessionId) {
  return join(AUTH_DIR, sessionId.replace(/[^a-zA-Z0-9_-]/g, '_'));
}

function contactsFilePath(sessionId) {
  return join(sessionAuthPath(sessionId), 'contacts_cache.json');
}

function loadContactsFromDisk(sessionId) {
  try {
    const raw = readFileSync(contactsFilePath(sessionId), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveContactsToDisk(sessionId, contacts) {
  try {
    writeFileSync(contactsFilePath(sessionId), JSON.stringify(contacts));
  } catch (e) {
    console.error(`[${sessionId}] Failed to save contacts: ${e.message}`);
  }
}

function groupsFilePath(sessionId) {
  return join(sessionAuthPath(sessionId), 'groups_cache.json');
}

function loadGroupsFromDisk(sessionId) {
  try {
    const raw = readFileSync(groupsFilePath(sessionId), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGroupsToDisk(sessionId, groups) {
  try {
    writeFileSync(groupsFilePath(sessionId), JSON.stringify(groups));
  } catch (e) {
    console.error(`[${sessionId}] Failed to save groups: ${e.message}`);
  }
}

function newslettersFilePath(sessionId) {
  return join(sessionAuthPath(sessionId), 'newsletters_cache.json');
}

function loadNewslettersFromDisk(sessionId) {
  try {
    const raw = readFileSync(newslettersFilePath(sessionId), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveNewslettersToDisk(sessionId, newsletters) {
  try {
    writeFileSync(newslettersFilePath(sessionId), JSON.stringify(newsletters));
  } catch (e) {
    console.error(`[${sessionId}] Failed to save newsletters: ${e.message}`);
  }
}

async function initSession(sessionId) {
  // Clean up previous socket if reconnecting
  const existing = sessions.get(sessionId);
  if (existing?.socket) {
    try { existing.socket.end(undefined); } catch {}
  }

  // Register session immediately so status polls see 'connecting' right away,
  // even before the async auth/version lookups complete.
  const sess = {
    socket:         null,
    status:         'connecting',
    qrDataUrl:      existing?.qrDataUrl ?? null,
    contacts:       existing?.contacts?.length > 0 ? existing.contacts : loadContactsFromDisk(sessionId),
    groups:         existing?.groups?.length > 0 ? existing.groups : loadGroupsFromDisk(sessionId),
    newsletters:    existing?.newsletters?.length > 0 ? existing.newsletters : loadNewslettersFromDisk(sessionId),
    reconnectTimer: null,
  };
  sessions.set(sessionId, sess);
  console.log(`[${sessionId}] Init session — ${sess.contacts.length} contacts, ${sess.groups.length} groups from cache`);

  const authPath = sessionAuthPath(sessionId);
  mkdirSync(authPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authPath);

  // Fetch the latest WA version from WhatsApp's own endpoint.
  // Fallback: last known good version (update if WhatsApp rejects connections).
  let version = [2, 2413, 51];
  try {
    const v = await fetchLatestBaileysVersion();
    version = v.version;
    console.log(`[${sessionId}] WA version: ${version.join('.')}`);
  } catch (e) {
    console.log(`[${sessionId}] Using fallback WA version: ${version.join('.')} (fetch error: ${e.message})`);
  }

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
    },
    logger: silentLogger,
    printQRInTerminal: false,
    browser: ['CA Office', 'Chrome', '120.0'],
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
    syncFullHistory: true,
    shouldSyncHistoryMessage: () => true,
  });

  sess.socket = sock;

  sock.ev.on('creds.update', saveCreds);

  // ── Contact helpers ───────────────────────────────────────────────────────

  // Returns true for JIDs that are not individual contacts
  function isNonContact(jid) {
    if (!jid) return true;
    return jid.endsWith('@g.us') || jid.endsWith('@newsletter') || jid.endsWith('@broadcast');
  }

  // Resolve the best display name for a contact; fall back to phone number
  function resolveName(c) {
    return c.name || c.notify || c.verifiedName || (c.id ? `+${c.id.split('@')[0]}` : null);
  }

  let contactsSaveTimer = null;
  function scheduleContactSave() {
    if (contactsSaveTimer) clearTimeout(contactsSaveTimer);
    contactsSaveTimer = setTimeout(() => saveContactsToDisk(sessionId, sess.contacts), 2000);
  }

  function upsertContact(c) {
    if (isNonContact(c.id)) return;
    const name = resolveName(c);
    if (!name) return;
    const existing = sess.contacts.findIndex((x) => x.id === c.id);
    const entry = { id: c.id, name, type: 'contact' };
    if (existing >= 0) {
      // Prefer a real display name over a phone-number fallback
      const hadRealName = !sess.contacts[existing].name.startsWith('+');
      if (!hadRealName || (c.name || c.notify || c.verifiedName)) {
        sess.contacts[existing] = entry;
      }
    } else {
      sess.contacts.push(entry);
    }
  }

  // contacts.set — handle both { contacts: [...] } and raw array payloads
  sock.ev.on('contacts.set', (data) => {
    const list = Array.isArray(data) ? data : (data?.contacts || []);
    for (const c of list) upsertContact(c);
    console.log(`[${sessionId}] contacts.set: ${list.length} incoming, ${sess.contacts.length} total`);
    scheduleContactSave();
  });

  // messaging-history.set — Baileys 6.7+ delivers contacts/chats/messages via this
  // event during history sync (both fresh QR and reconnects with saved credentials).
  sock.ev.on('messaging-history.set', (data) => {
    const histContacts = Array.isArray(data) ? data : (data?.contacts || []);
    if (histContacts.length) {
      for (const c of histContacts) upsertContact(c);
    }

    // Enrich contacts from individual chat metadata — chats carry saved names
    // that may not appear in the contacts list (e.g. pushName from chat history)
    const histChats = data?.chats || [];
    let enriched = 0;
    for (const chat of histChats) {
      if (!chat.id || !chat.name) continue;
      if (chat.id.endsWith('@s.whatsapp.net') || chat.id.endsWith('@lid')) {
        upsertContact({ id: chat.id, name: chat.name });
        enriched++;
      }
    }

    console.log(`[${sessionId}] messaging-history.set: ${histContacts.length} contacts, ${enriched} from chats, ${sess.contacts.length} total`);
    scheduleContactSave();
  });

  // contacts.upsert — incremental additions/updates pushed by WhatsApp
  sock.ev.on('contacts.upsert', (incoming) => {
    for (const c of incoming) upsertContact(c);
    console.log(`[${sessionId}] contacts.upsert: ${sess.contacts.length} total`);
    scheduleContactSave();
  });

  // contacts.update — fires when a contact's name/avatar changes (e.g. after privacy toggle)
  sock.ev.on('contacts.update', (updates) => {
    for (const c of updates) {
      if (isNonContact(c.id)) continue;
      const displayName = c.name || c.notify || c.verifiedName;
      if (!displayName) continue;
      const existing = sess.contacts.findIndex((x) => x.id === c.id);
      if (existing >= 0) {
        sess.contacts[existing] = { ...sess.contacts[existing], name: displayName };
      } else {
        sess.contacts.push({ id: c.id, name: displayName, type: 'contact' });
      }
    }
    console.log(`[${sessionId}] contacts.update: ${sess.contacts.length} total`);
    scheduleContactSave();
  });

  // Enrich contacts from incremental chat events — individual chats carry
  // the saved contact name which may not arrive via contacts.upsert.
  function enrichFromChats(chats) {
    let enriched = 0;
    for (const chat of chats) {
      if (!chat.id || !chat.name) continue;
      if (chat.id.endsWith('@s.whatsapp.net') || chat.id.endsWith('@lid')) {
        upsertContact({ id: chat.id, name: chat.name });
        enriched++;
      }
    }
    if (enriched > 0) {
      console.log(`[${sessionId}] chats enriched ${enriched} contacts, ${sess.contacts.length} total`);
      scheduleContactSave();
    }
  }

  sock.ev.on('chats.set', (data) => {
    const list = Array.isArray(data) ? data : (data?.chats || []);
    enrichFromChats(list);
  });

  sock.ev.on('chats.upsert', (chats) => {
    enrichFromChats(Array.isArray(chats) ? chats : []);
  });

  // Extract pushName from incoming messages to enrich number-only contacts
  sock.ev.on('messages.upsert', ({ messages: msgs }) => {
    if (!msgs?.length) return;
    let enriched = 0;
    for (const msg of msgs) {
      const pushName = msg.pushName;
      if (!pushName) continue;
      // For individual chats use remoteJid; for group messages use participant
      const jid = msg.key?.participant || msg.key?.remoteJid;
      if (!jid || isNonContact(jid)) continue;
      const idx = sess.contacts.findIndex((x) => x.id === jid);
      if (idx >= 0 && sess.contacts[idx].name.startsWith('+')) {
        sess.contacts[idx] = { ...sess.contacts[idx], name: pushName };
        enriched++;
      } else if (idx < 0) {
        sess.contacts.push({ id: jid, name: pushName, type: 'contact' });
        enriched++;
      }
    }
    if (enriched > 0) {
      console.log(`[${sessionId}] messages.upsert enriched ${enriched} contacts, ${sess.contacts.length} total`);
      scheduleContactSave();
    }
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      try {
        sess.qrDataUrl = await QRCode.toDataURL(qr);
        sess.status    = 'connecting';
        console.log(`[${sessionId}] QR generated`);
      } catch (e) {
        console.error(`[${sessionId}] QR error: ${e.message}`);
      }
    }

    if (connection === 'open') {
      sess.status    = 'connected';
      sess.qrDataUrl = null;
      console.log(`[${sessionId}] Connected`);
      // Single delayed group load to avoid WhatsApp rate-limiting
      setTimeout(() => loadGroups(sessionId), 5_000);
    }

    if (connection === 'close') {
      const code   = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      const errMsg = lastDisconnect?.error?.message || lastDisconnect?.error?.toString() || 'no error';

      console.log(`[${sessionId}] Closed (code=${code}, loggedOut=${loggedOut}, err=${errMsg})`);
      sess.status = 'disconnected';
      sess.socket = null;

      if (loggedOut) {
        // Delete auth so user must scan QR again
        rmSync(sessionAuthPath(sessionId), { recursive: true, force: true });
      } else {
        // Auto-reconnect: use 15 s to avoid WhatsApp rate-limiting (405/connection failure)
        if (sess.reconnectTimer) clearTimeout(sess.reconnectTimer);
        sess.reconnectTimer = setTimeout(() => {
          console.log(`[${sessionId}] Reconnecting…`);
          initSession(sessionId).catch((e) =>
            console.error(`[${sessionId}] Reconnect failed: ${e.message}`)
          );
        }, 15_000);
      }
    }
  });
}

async function loadGroups(sessionId) {
  const sess = sessions.get(sessionId);
  if (!sess?.socket) return;

  try {
    const chats = await sess.socket.groupFetchAllParticipating();
    sess.groups = Object.values(chats).map((g) => ({
      id:           g.id,
      name:         g.subject || g.id,
      type:         'group',
      membersCount: g.participants?.length || 0,
    }));
    saveGroupsToDisk(sessionId, sess.groups);
    console.log(`[${sessionId}] Loaded ${sess.groups.length} groups`);
  } catch (e) {
    console.error(`[${sessionId}] Groups error: ${e.message}`);
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_, res) => res.json({ ok: true, sessions: sessions.size }));

// POST /session/start
app.post('/session/start', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const existing = sessions.get(sessionId);
  if (existing?.status === 'connected') {
    return res.json({ status: 'connected' });
  }

  // Non-blocking: start and respond immediately
  initSession(sessionId).catch((e) =>
    console.error(`[${sessionId}] Init error: ${e.message}`)
  );
  return res.json({ status: 'connecting' });
});

// GET /session/:id/status
app.get('/session/:id/status', (req, res) => {
  const sess = sessions.get(req.params.id);
  const authPath = sessionAuthPath(req.params.id);
  const authExists = existsSync(authPath);

  // Auto-reconnect: if session not in memory but saved credentials exist on disk
  // (e.g. bridge restarted), silently reconnect so user doesn't need to re-scan QR.
  if (!sess && authExists) {
    console.log(`[${req.params.id}] Auth found on disk — auto-reconnecting after restart…`);
    initSession(req.params.id).catch((e) =>
      console.error(`[${req.params.id}] Auto-reconnect failed: ${e.message}`)
    );
    return res.json({ status: 'connecting', qr: null });
  }

  if (!sess) return res.json({ status: 'disconnected' });
  return res.json({ status: sess.status, qr: sess.qrDataUrl || null });
});

// POST /session/stop
app.post('/session/stop', async (req, res) => {
  const { sessionId } = req.body;
  const sess = sessions.get(sessionId);
  if (sess) {
    if (sess.reconnectTimer) clearTimeout(sess.reconnectTimer);
    if (sess.socket) {
      try { sess.socket.end(undefined); } catch {}
    }
    sessions.delete(sessionId);
    rmSync(sessionAuthPath(sessionId), { recursive: true, force: true });
  }
  res.json({ status: 'disconnected' });
});

// GET /session/:id/contacts
app.get('/session/:id/contacts', (req, res) => {
  const sess = sessions.get(req.params.id);
  if (!sess || sess.status !== 'connected') {
    return res.status(423).json({ error: 'Session not connected' });
  }
  // Filter out any group/broadcast/newsletter JIDs that may have slipped through
  const contacts = sess.contacts.filter((c) =>
    !c.id.endsWith('@g.us') && !c.id.endsWith('@newsletter') && !c.id.endsWith('@broadcast')
  );
  res.json({ contacts });
});

// GET /session/:id/groups
app.get('/session/:id/groups', (req, res) => {
  const sess = sessions.get(req.params.id);
  if (!sess || sess.status !== 'connected') {
    return res.status(423).json({ error: 'Session not connected' });
  }
  // Groups are loaded on connection open (with 5s delay) and cached to disk.
  // No background refresh here to avoid WhatsApp rate-limiting.
  res.json({ groups: sess.groups });
});

// GET /session/:id/newsletters — list channels stored for this session
app.get('/session/:id/newsletters', (req, res) => {
  const sess = sessions.get(req.params.id);
  if (!sess || sess.status !== 'connected') {
    return res.status(423).json({ error: 'Session not connected' });
  }
  res.json({ newsletters: sess.newsletters });
});

// POST /session/:id/newsletters — add a WhatsApp Channel by JID or invite code
app.post('/session/:id/newsletters', async (req, res) => {
  const sess = sessions.get(req.params.id);
  if (!sess || sess.status !== 'connected' || !sess.socket) {
    return res.status(423).json({ error: 'Session not connected' });
  }

  let { jid, inviteCode, name } = req.body;

  // Normalise JID: strip trailing whitespace and ensure @newsletter suffix
  if (jid) {
    jid = String(jid).trim();
    if (!jid.endsWith('@newsletter')) jid = jid + '@newsletter';
  }

  // Resolve invite code → JID via Baileys (try multiple API names across versions)
  if (!jid && inviteCode) {
    const code = String(inviteCode).trim().replace(/^.*\/channel\//i, '');
    const metadataFn = sess.socket.newsletterMetadata
      || sess.socket.getNewsletterInfo
      || sess.socket.newsletterGetInfo;

    if (metadataFn) {
      try {
        const meta = await metadataFn.call(sess.socket, 'invite', code);
        jid  = meta?.id ?? null;
        name = name || meta?.name || meta?.id || inviteCode;
      } catch (e) {
        console.error(`[${req.params.id}] Newsletter metadata error: ${e.message}`);
        return res.status(400).json({ error: `Could not resolve invite code: ${e.message}` });
      }
    } else {
      // Baileys version lacks newsletter API — store with invite code as identifier
      console.log(`[${req.params.id}] newsletterMetadata not available, storing channel with invite code`);
      jid = code + '@newsletter';
      name = name || inviteCode;
    }
  }

  if (!jid) {
    return res.status(400).json({ error: 'Provide jid or inviteCode' });
  }

  // Avoid duplicates
  if (sess.newsletters.some((n) => n.id === jid)) {
    return res.json({ newsletter: sess.newsletters.find((n) => n.id === jid), alreadyExists: true });
  }

  const entry = { id: jid, name: name || jid, type: 'newsletter' };
  sess.newsletters.push(entry);
  saveNewslettersToDisk(req.params.id, sess.newsletters);
  console.log(`[${req.params.id}] Channel added: ${jid} (${entry.name})`);
  res.json({ newsletter: entry });
});

// DELETE /session/:id/newsletters/:jid — remove a channel from the list
app.delete('/session/:id/newsletters/:jid', (req, res) => {
  const sess = sessions.get(req.params.id);
  if (!sess) return res.status(404).json({ error: 'Session not found' });

  const jid = decodeURIComponent(req.params.jid);
  const before = sess.newsletters.length;
  sess.newsletters = sess.newsletters.filter((n) => n.id !== jid);
  saveNewslettersToDisk(req.params.id, sess.newsletters);
  console.log(`[${req.params.id}] Channel removed: ${jid} (had ${before}, now ${sess.newsletters.length})`);
  res.json({ ok: true });
});

// POST /send
app.post('/send', async (req, res) => {
  const { sessionId, targetId, message } = req.body;

  if (!sessionId || !targetId) {
    return res.status(400).json({ error: 'sessionId and targetId required' });
  }

  const sess = sessions.get(sessionId);
  if (!sess || sess.status !== 'connected' || !sess.socket) {
    return res.status(423).json({ error: 'Session not connected' });
  }

  try {
    await sess.socket.sendMessage(targetId, { text: message || '' });
    res.json({ ok: true });
  } catch (e) {
    console.error(`[${sessionId}] Send error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

mkdirSync(AUTH_DIR, { recursive: true });

// Bind to 0.0.0.0 to ensure both IPv4 (127.0.0.1) and IPv6 (::1) are reachable.
// Some cPanel environments bind Express to :: (IPv6-only) by default, which
// causes PHP curl calls to 127.0.0.1 to get ECONNREFUSED.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`WA Bridge v2 (Baileys) running on port ${PORT} (0.0.0.0)`);
  console.log(`Health: http://127.0.0.1:${PORT}/health`);
});
