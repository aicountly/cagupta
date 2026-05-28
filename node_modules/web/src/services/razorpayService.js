/**
 * Razorpay Checkout helpers (order created by PHP API).
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

export function loadRazorpayScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Razorpay script'));
    document.body.appendChild(s);
  });
}

/** @param {number|string} appointmentId */
export async function createRazorpayOrderForAppointment(appointmentId, amount = null) {
  const body = amount != null && amount > 0 ? { amount } : {};
  const res = await fetch(`${API_BASE}/admin/appointments/${appointmentId}/razorpay-order`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return data.data;
}

/** @param {number|string} txnId — ledger invoice txn id */
export async function createRazorpayOrderForTxn(txnId, amount = null) {
  const body = amount != null && amount > 0 ? { amount } : {};
  const res = await fetch(`${API_BASE}/admin/txn/${txnId}/razorpay-order`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return data.data;
}

/**
 * @param {object} opts
 * @param {string} opts.keyId
 * @param {string} opts.orderId
 * @param {number} opts.amountPaise
 * @param {string} [opts.name]
 * @param {string} [opts.description]
 * @param {(response: object) => void} opts.onSuccess
 * @param {(err: Error) => void} [opts.onFailure]
 */
export function openRazorpayCheckout(opts) {
  const { keyId, orderId, amountPaise, name, description, onSuccess, onFailure } = opts;
  if (!window.Razorpay) {
    onFailure?.(new Error('Razorpay script not loaded'));
    return;
  }
  const options = {
    key: keyId,
    amount: amountPaise,
    currency: 'INR',
    name: name || 'CA Office Portal',
    description: description || 'Payment',
    order_id: orderId,
    handler(response) {
      onSuccess(response);
    },
    modal: {
      ondismiss() {},
    },
  };
  try {
    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (resp) => {
      onFailure?.(new Error(resp?.error?.description || 'Payment failed'));
    });
    rzp.open();
  } catch (e) {
    onFailure?.(e instanceof Error ? e : new Error(String(e)));
  }
}
