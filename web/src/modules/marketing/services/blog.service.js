/**
 * blog.service.js
 *
 * API helpers for Blog Management and AI Draft Approval.
 *
 * Authenticated endpoints (staff):
 *   GET    /api/marketing/blog/posts
 *   POST   /api/marketing/blog/posts
 *   PUT    /api/marketing/blog/posts/:id
 *   DELETE /api/marketing/blog/posts/:id
 *   POST   /api/marketing/blog/posts/:id/publish
 *   GET    /api/marketing/blog/drafts
 *   PUT    /api/marketing/blog/drafts/:id
 *   POST   /api/marketing/blog/drafts/:id/approve
 *   POST   /api/marketing/blog/drafts/:id/reject
 *   POST   /api/marketing/blog/upload-image
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
  const res = await fetch(`${BASE}/api/marketing/blog/posts?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createBlogPost(data) {
  const res = await fetch(`${BASE}/api/marketing/blog/posts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function updateBlogPost(id, data) {
  const res = await fetch(`${BASE}/api/marketing/blog/posts/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteBlogPost(id) {
  const res = await fetch(`${BASE}/api/marketing/blog/posts/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function publishBlogPost(id) {
  const res = await fetch(`${BASE}/api/marketing/blog/posts/${id}/publish`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── AI Drafts ────────────────────────────────────────────────────────────────

export async function fetchDrafts({ status = 'pending', category = '' } = {}) {
  const params = new URLSearchParams({ status });
  if (category) params.set('category', category);
  const res = await fetch(`${BASE}/api/marketing/blog/drafts?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function updateDraft(id, data) {
  const res = await fetch(`${BASE}/api/marketing/blog/drafts/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function approveDraft(id) {
  const res = await fetch(`${BASE}/api/marketing/blog/drafts/${id}/approve`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function rejectDraft(id) {
  const res = await fetch(`${BASE}/api/marketing/blog/drafts/${id}/reject`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── Image Upload ─────────────────────────────────────────────────────────────

export async function uploadBlogImage(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${BASE}/api/marketing/blog/upload-image`, {
    method: 'POST',
    headers: authHeadersMultipart(),
    body: formData,
  });
  return handleResponse(res);
}
