/**
 * blog.service.js
 *
 * API helpers for Blog Management and AI Draft Approval.
 *
 * Authenticated endpoints (staff); paths are under API_BASE_URL (already includes /api):
 *   GET    marketing/blog/posts
 *   POST   marketing/blog/posts
 *   PUT    marketing/blog/posts/:id
 *   DELETE marketing/blog/posts/:id
 *   POST   marketing/blog/posts/:id/publish
 *   GET    marketing/blog/drafts
 *   PUT    marketing/blog/drafts/:id
 *   POST   marketing/blog/drafts/:id/approve
 *   POST   marketing/blog/drafts/:id/reject
 *   POST   marketing/blog/generate-ai-drafts
 *   POST   marketing/blog/upload-image
 */

import { API_BASE_URL } from '../../../constants/config';

const BASE = API_BASE_URL;

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function authHeadersMultipart() {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
  return json;
}

// ── Blog Posts ───────────────────────────────────────────────────────────────

export async function fetchBlogPosts({ category = '', status = '', page = 1 } = {}) {
  const params = new URLSearchParams({ page });
  if (category) params.set('category', category);
  if (status)   params.set('status', status);
  const res = await fetch(`${BASE}/marketing/blog/posts?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createBlogPost(data) {
  const res = await fetch(`${BASE}/marketing/blog/posts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function updateBlogPost(id, data) {
  const res = await fetch(`${BASE}/marketing/blog/posts/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteBlogPost(id) {
  const res = await fetch(`${BASE}/marketing/blog/posts/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function publishBlogPost(id, sendEmail = false, waChannelJid = null) {
  const res = await fetch(`${BASE}/marketing/blog/posts/${id}/publish`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      send_email: sendEmail,
      ...(waChannelJid ? { send_wa_channel: true, wa_channel_jid: waChannelJid } : {}),
    }),
  });
  return handleResponse(res);
}

export async function resendBlogEmail(id) {
  const res = await fetch(`${BASE}/marketing/blog/posts/${id}/resend-email`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function shareToWaChannel(id, waChannelJid) {
  const res = await fetch(`${BASE}/marketing/blog/posts/${id}/share-wa`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ wa_channel_jid: waChannelJid }),
  });
  return handleResponse(res);
}

// ── AI Drafts ────────────────────────────────────────────────────────────────

export async function fetchDrafts({ status = 'pending', category = '' } = {}) {
  const params = new URLSearchParams({ status });
  if (category) params.set('category', category);
  const res = await fetch(`${BASE}/marketing/blog/drafts?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function updateDraft(id, data) {
  const res = await fetch(`${BASE}/marketing/blog/drafts/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function approveDraft(id, sendEmail = false, waChannelJid = null) {
  const res = await fetch(`${BASE}/marketing/blog/drafts/${id}/approve`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      send_email: sendEmail,
      ...(waChannelJid ? { send_wa_channel: true, wa_channel_jid: waChannelJid } : {}),
    }),
  });
  return handleResponse(res);
}

export async function rejectDraft(id) {
  const res = await fetch(`${BASE}/marketing/blog/drafts/${id}/reject`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

/** Same pipeline as cron — requires OpenAI in server .env. */
export async function generateAiDraftsNow(body = {}) {
  const res = await fetch(`${BASE}/marketing/blog/generate-ai-drafts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

/**
 * Streams server activity via SSE ({ stream: true }).
 *
 * Events: log, model_delta `{ context, phase, chunk }`, done, error.
 *
 * @param {Record<string, unknown>} body forwarded to API (minus stream flag)
 * @param {{ onLogLine?: (line: string) => void, onModelChunk?: (payload: { context?: string, phase: string, chunk: string }) => void, signal?: AbortSignal }} opts
 */
export async function generateAiDraftsStream(body = {}, opts = {}) {
  const { onLogLine, onModelChunk, signal } = opts;
  const res = await fetch(`${BASE}/marketing/blog/generate-ai-drafts`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message || `HTTP ${res.status}`);
  }
  if (!res.body) throw new Error('Streaming is not supported in this browser.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  /** @type {Record<string, unknown>|null} */
  let donePayload = null;

  /** @returns {boolean} ended with `done` event */
  const ingestBlocks = () => {
    let ended = false;
    while (!ended) {
      const sep = buffer.indexOf('\n\n');
      if (sep < 0) break;
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      let eventName = 'message';
      /** @type {string[]} */
      const dataLines = [];
      for (const line of block.split('\n')) {
        if (!line) continue;
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const rest = line.slice(5);
          dataLines.push(rest.startsWith(' ') ? rest.slice(1) : rest);
        }
      }

      const dataStr = dataLines.join('\n');
      if (!dataStr) continue;
      /** @type {Record<string, unknown>} */
      let parsed;
      try {
        parsed = JSON.parse(dataStr);
      } catch {
        continue;
      }

      if (eventName === 'model_delta') {
        if (typeof onModelChunk === 'function') {
          onModelChunk({
            context: parsed.context != null ? String(parsed.context) : '',
            phase: parsed.phase != null ? String(parsed.phase) : 'assistant',
            chunk: parsed.chunk != null ? String(parsed.chunk) : '',
          });
        }
        continue;
      }
      if (eventName === 'log') {
        const line = parsed.line != null ? String(parsed.line) : '';
        if (line && typeof onLogLine === 'function') {
          onLogLine(line);
        }
        continue;
      }
      if (eventName === 'error') {
        throw new Error(String(parsed.message || 'Generation failed'));
      }
      if (eventName === 'done') {
        donePayload = parsed;
        ended = true;
      }
    }
    return ended;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      if (ingestBlocks()) break;
      if (done) break;
    }
    ingestBlocks();
  } finally {
    reader.releaseLock();
  }

  if (!donePayload) {
    throw new Error('Connection closed before planner finished.');
  }
  return donePayload;
}
// ── Public API (no auth — for /blog public pages) ────────────────────────────

/**
 * Fetch published blog posts for the public blog listing page (no auth).
 */
export async function fetchPublicBlogPosts({ category = '', page = 1 } = {}) {
  const params = new URLSearchParams({ page });
  if (category) params.set('category', category);
  const res = await fetch(`${BASE}/public/blogs?${params}`);
  return handleResponse(res);
}

/**
 * Fetch a single published blog post by slug (no auth).
 */
export async function fetchPublicBlogPost(slug) {
  const res = await fetch(`${BASE}/public/blogs/${encodeURIComponent(slug)}`);
  return handleResponse(res);
}

// ── Image Upload ─────────────────────────────────────────────────────────────

export async function uploadBlogImage(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${BASE}/marketing/blog/upload-image`, {
    method: 'POST',
    headers: authHeadersMultipart(),
    body: formData,
  });
  return handleResponse(res);
}
