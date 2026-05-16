/**
 * Application-wide constants.
 *
 * SUPER_ADMIN_EMAIL must match the value hardcoded in server-php/app/Config/Auth.php.
 */
export const SUPER_ADMIN_EMAIL = 'rahul@cagupta.in';

/**
 * Base URL for the PHP API backend (prefix for paths like `/admin/...`, no trailing slash).
 *
 * Set VITE_API_BASE_URL in your .env file to match your deployment (same value for every API call).
 * Falls back to localhost dev server when not configured.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

/**
 * Mirrors server env LEDGER_USER_REVERSAL_ENABLED — when true, staff may reverse
 * receipt / payment / TDS within 30 days using an OTP to their own email.
 */
export const LEDGER_USER_REVERSAL_ENABLED = import.meta.env.VITE_LEDGER_USER_REVERSAL_ENABLED === 'true';
