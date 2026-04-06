/**
 * serviceCategoryService.js
 *
 * API helpers for Service Categories, Subcategories, and Engagement Types.
 * Calls the PHP backend when VITE_API_BASE_URL is set.
 */

import { API_BASE_URL } from '../constants/config';

const API_BASE = API_BASE_URL;

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseResponse(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || `Request failed (${res.status})`);
  }
  return json;
}

// ── Categories ────────────────────────────────────────────────────────────────

/**
 * Fetch all service categories (with nested subcategories and engagement types).
 * @returns {Promise<object[]>}
 */
export async function getCategories() {
  const res = await fetch(`${API_BASE}/admin/service-categories`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data || [];
}

/**
 * Create a new service category.
 * @param {{ name: string }} payload
 * @returns {Promise<object>}
 */
export async function createCategory(payload) {
  const res = await fetch(`${API_BASE}/admin/service-categories`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify({ name: payload.name }),
  });
  const data = await parseResponse(res);
  return data.data;
}

/**
 * Delete a service category.
 * @param {number|string} id
 */
export async function deleteCategory(id) {
  const res = await fetch(`${API_BASE}/admin/service-categories/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}

// ── Subcategories ─────────────────────────────────────────────────────────────

/**
 * Fetch subcategories for a category.
 * @param {number|string} categoryId
 * @returns {Promise<object[]>}
 */
export async function getSubcategories(categoryId) {
  const res = await fetch(`${API_BASE}/admin/service-categories/${categoryId}/subcategories`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data || [];
}

/**
 * Create a subcategory under a category.
 * @param {number|string} categoryId
 * @param {{ name: string }} payload
 * @returns {Promise<object>}
 */
export async function createSubcategory(categoryId, payload) {
  const res = await fetch(`${API_BASE}/admin/service-categories/${categoryId}/subcategories`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify({ name: payload.name }),
  });
  const data = await parseResponse(res);
  return data.data;
}

/**
 * Delete a subcategory.
 * @param {number|string} id
 */
export async function deleteSubcategory(id) {
  const res = await fetch(`${API_BASE}/admin/service-subcategories/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}

// ── Engagement Types ──────────────────────────────────────────────────────────

/**
 * Fetch engagement types for a category.
 * @param {number|string} categoryId
 * @returns {Promise<object[]>}
 */
export async function getEngagementTypes(categoryId) {
  const res = await fetch(`${API_BASE}/admin/service-categories/${categoryId}/engagement-types`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data || [];
}

/**
 * Create an engagement type under a category.
 * @param {number|string} categoryId
 * @param {{ name: string }} payload
 * @returns {Promise<object>}
 */
export async function createEngagementType(categoryId, payload) {
  const res = await fetch(`${API_BASE}/admin/service-categories/${categoryId}/engagement-types`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify({ name: payload.name }),
  });
  const data = await parseResponse(res);
  return data.data;
}

/**
 * Delete an engagement type.
 * @param {number|string} id
 */
export async function deleteEngagementType(id) {
  const res = await fetch(`${API_BASE}/admin/engagement-types/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}
