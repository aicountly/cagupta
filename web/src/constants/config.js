/**
 * Application-wide constants.
 *
 * SUPER_ADMIN_EMAIL must match the value hardcoded in server-php/app/Config/Auth.php.
 */
export const SUPER_ADMIN_EMAIL = 'rahul@cagupta.in';

/**
 * Base URL for the PHP API backend.
 *
 * Set VITE_API_BASE_URL in your .env file.
 * Falls back to localhost dev server when not configured.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';
