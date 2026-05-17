/**
 * analytics.js — Google Analytics 4 integration for the staff portal.
 *
 * Set VITE_GA4_MEASUREMENT_ID in web/.env to enable.
 * When the env var is absent (e.g. mock mode) all calls are no-ops.
 *
 * Usage:
 *   import { initAnalytics, trackPageView, trackEvent } from '../utils/analytics';
 *   initAnalytics();           // call once at app mount
 *   trackPageView('/path');    // call on every route change
 */

const GA4_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID;
let initialized = false;

export function initAnalytics() {
  if (initialized || !GA4_ID || typeof window === 'undefined') return;
  initialized = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
  window.gtag('js', new Date());
  window.gtag('config', GA4_ID, { send_page_view: false });
}

export function trackPageView(path, title) {
  if (!GA4_ID || typeof window.gtag !== 'function') return;
  window.gtag('config', GA4_ID, { page_path: path, page_title: title });
}

export function trackEvent(eventName, params = {}) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', eventName, params);
}

// Named helpers used across the portal

export function trackAffiliateLink(affiliateId, linkUrl) {
  trackEvent('affiliate_link_click', { affiliate_id: String(affiliateId), link_url: linkUrl });
}

export function trackDocumentDownload(documentId, documentName) {
  trackEvent('document_download', { document_id: String(documentId), document_name: documentName });
}

export function trackClientEngagement(clientId, action) {
  trackEvent('client_engagement', { client_id: String(clientId), engagement_action: action });
}

export function trackBlogCTAClick() {
  trackEvent('blog_cta_click', { source: 'blog_post' });
}

export function trackBlogLeadSubmit(service) {
  trackEvent('blog_lead_submit', { service_interest: service || 'general' });
}

export function trackLeadFormSubmit(service) {
  trackEvent('lead_form_submit', { service_interest: service || 'general' });
}
