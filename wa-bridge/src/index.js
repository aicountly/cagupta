/**
 * WA Bridge v2 — Baileys-based WhatsApp Web session manager
 *
 * Uses @whiskeysockets/baileys (WebSocket, no Chromium required).
 * Works on shared hosting where Puppeteer/Chrome is unavailable.
 *
 * Endpoints:
 *   POST /session/start           { sessionId }   → starts/reconnects a session
 *   GET  /session/:id/status      → { status, qr? }
 *   POST /session/stop            { sessionId }   → destroys the session
 *   GET  /session/:id/contacts    → { contacts: [...] }
 *   GET  /session/:id/groups      → { groups: [...] }
 *   POST /send                    { sessionId, targetId, targetType, message }
 *
 * Session statuses: disconnected | connecting | connected
 */

// Polyfill Web Crypto API for Node.js 18 (required by Baileys 6.7+; native in Node 19+)
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import { existsSync, mkdirSync, rmSync } from 'fs';
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
    contacts:       existing?.contacts ?? [],
    groups:         existing?.groups ?? [],
    reconnectTimer: null,
  };
  sessions.set(sessionId, sess);

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
  });

  sess.socket = sock;

  sock.ev.on('creds.update', saveCreds);

  // Populate contacts from Baileys push events
  sock.ev.on('contacts.upsert', (incoming) => {
    for (const c of incoming) {
      const displayName = c.name || c.notify || c.verifiedName || null;
      if (!displayName) continue; // skip contacts with no name
      const existing = sess.contacts.findIndex((x) => x.id === c.id);
      const entry = { id: c.id, name: displayName, type: 'contact' };
      if (existing >= 0) {
        sess.contacts[existing] = entry;
      } else {
        sess.contacts.push(entry);
      }
    }
    console.log(`[${sessionId}] Contacts updated: ${sess.contacts.length} total`);
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
      loadContactsAndGroups(sessionId);
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

async function loadContactsAndGroups(sessionId) {
  const sess = sessions.get(sessionId);
  if (!sess?.socket) return;

  try {
    // Baileys exposes contacts via store; for simplicity use chats
    const chats = await sess.socket.groupFetchAllParticipating();
    sess.groups = Object.values(chats).map((g) => ({
      id:           g.id,
      name:         g.subject || g.id,
      type:         'group',
      membersCount: g.participants?.length || 0,
    }));
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

// GET /session/:id/contacts  (contacts not natively available in Baileys without a store; return empty for now)
app.get('/session/:id/contacts', (req, res) => {
  const sess = sessions.get(req.params.id);
  if (!sess || sess.status !== 'connected') {
    return res.status(423).json({ error: 'Session not connected' });
  }
  res.json({ contacts: sess.contacts });
});

// GET /session/:id/groups
app.get('/session/:id/groups', (req, res) => {
  const sess = sessions.get(req.params.id);
  if (!sess || sess.status !== 'connected') {
    return res.status(423).json({ error: 'Session not connected' });
  }
  // Refresh groups on request
  loadContactsAndGroups(req.params.id);
  res.json({ groups: sess.groups });
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
