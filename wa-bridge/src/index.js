/**
 * WA Bridge — WhatsApp Web session manager for CA Office Portal
 *
 * Manages multiple concurrent WA Web sessions (one per staff user).
 * Each session is isolated: user A cannot see user B's QR or contacts.
 *
 * Endpoints:
 *   POST /session/start           { sessionId }   → starts/reconnects a session
 *   GET  /session/:id/status      → { status, qr? }
 *   POST /session/stop            { sessionId }   → destroys the session
 *   GET  /session/:id/contacts    → { contacts: [...] }
 *   GET  /session/:id/groups      → { groups: [...] }
 *   POST /send                    { sessionId, targetId, targetType, message } → sends a message
 *
 * Session statuses: disconnected | connecting | connected
 */

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const QRCode  = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));

// ── In-memory session map ─────────────────────────────────────────────────────
// Map<sessionId, { client, status, qrDataUrl, contacts, groups }>

const sessions = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      client:    null,
      status:    'disconnected',
      qrDataUrl: null,
      contacts:  [],
      groups:    [],
    });
  }
  return sessions.get(sessionId);
}

async function initClient(sessionId) {
  const sess = getOrCreateSession(sessionId);

  // Destroy existing client if any
  if (sess.client) {
    try { await sess.client.destroy(); } catch {}
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: sessionId, dataPath: './.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  });

  sess.client    = client;
  sess.status    = 'connecting';
  sess.qrDataUrl = null;

  client.on('qr', async (qr) => {
    try {
      sess.qrDataUrl = await QRCode.toDataURL(qr);
    } catch {
      sess.qrDataUrl = null;
    }
    sess.status = 'connecting';
    console.log(`[${sessionId}] QR generated`);
  });

  client.on('ready', async () => {
    sess.status    = 'connected';
    sess.qrDataUrl = null;
    console.log(`[${sessionId}] WhatsApp ready`);

    // Pre-fetch contacts and groups
    try {
      const rawContacts = await client.getContacts();
      sess.contacts = rawContacts
        .filter((c) => c.isMyContact && !c.isGroup && c.name)
        .map((c) => ({ id: c.id._serialized, name: c.name || c.pushname || c.number, type: 'contact' }));

      const rawChats = await client.getChats();
      sess.groups = rawChats
        .filter((c) => c.isGroup)
        .map((c) => ({ id: c.id._serialized, name: c.name, type: 'group', membersCount: c.participants?.length || 0 }));

      console.log(`[${sessionId}] Loaded ${sess.contacts.length} contacts, ${sess.groups.length} groups`);
    } catch (e) {
      console.error(`[${sessionId}] Failed to fetch contacts: ${e.message}`);
    }
  });

  client.on('disconnected', (reason) => {
    sess.status = 'disconnected';
    sess.client = null;
    console.log(`[${sessionId}] Disconnected: ${reason}`);
  });

  client.on('auth_failure', (msg) => {
    sess.status = 'disconnected';
    console.log(`[${sessionId}] Auth failure: ${msg}`);
  });

  await client.initialize();
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_, res) => res.json({ ok: true, sessions: sessions.size }));

// POST /session/start
app.post('/session/start', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  try {
    const sess = getOrCreateSession(sessionId);
    if (sess.status === 'connected') {
      return res.json({ status: 'connected' });
    }
    // Non-blocking start
    initClient(sessionId).catch((e) => console.error(`[${sessionId}] Init error: ${e.message}`));
    return res.json({ status: 'connecting' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /session/:id/status
app.get('/session/:id/status', (req, res) => {
  const sess = sessions.get(req.params.id);
  if (!sess) return res.json({ status: 'disconnected' });
  return res.json({ status: sess.status, qr: sess.qrDataUrl || null });
});

// POST /session/stop
app.post('/session/stop', async (req, res) => {
  const { sessionId } = req.body;
  const sess = sessions.get(sessionId);
  if (sess?.client) {
    try { await sess.client.destroy(); } catch {}
  }
  sessions.delete(sessionId);
  res.json({ status: 'disconnected' });
});

// GET /session/:id/contacts
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
  res.json({ groups: sess.groups });
});

// POST /send
app.post('/send', async (req, res) => {
  const { sessionId, targetId, targetType, message } = req.body;

  if (!sessionId || !targetId) {
    return res.status(400).json({ error: 'sessionId and targetId required' });
  }

  const sess = sessions.get(sessionId);
  if (!sess || sess.status !== 'connected' || !sess.client) {
    return res.status(423).json({ error: 'Session not connected' });
  }

  try {
    const chatId = targetType === 'group' ? targetId : targetId;
    await sess.client.sendMessage(chatId, message || '');
    res.json({ ok: true });
  } catch (e) {
    console.error(`[${sessionId}] Send error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`WA Bridge running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
