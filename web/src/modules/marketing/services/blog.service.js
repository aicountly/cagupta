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

export async function publishBlogPost(id) {
  const res = await fetch(`${BASE}/marketing/blog/posts/${id}/publish`, {
    method: 'POST',
    headers: authHeaders(),
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

export async function approveDraft(id) {
  const res = await fetch(`${BASE}/marketing/blog/drafts/${id}/approve`, {
    method: 'POST',
    headers: authHeaders(),
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

/** Same pipeline as cron (daily 6 AM) / cli/blog_ai_generate.php — requires OpenAI in server .env. */
export async function generateAiDraftsNow(body = {}) {
  const res = await fetch(`${BASE}/marketing/blog/generate-ai-drafts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
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
