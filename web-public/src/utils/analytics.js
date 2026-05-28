/**
 * analytics.js — Google Analytics 4 integration for the public marketing site.
 *
 * Set VITE_GA4_MARKETING_MEASUREMENT_ID in .env (or legacy VITE_GA4_MEASUREMENT_ID).
 * When the env var is absent all calls are no-ops.
 */

const GA4_ID =
  import.meta.env.VITE_GA4_MARKETING_MEASUREMENT_ID ||
  import.meta.env.VITE_GA4_MEASUREMENT_ID;
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

export function trackLeadFormSubmit(service) {
  trackEvent('lead_form_submit', {
    service_interest: service || 'general',
    source: 'contact_page',
  });
}

export function trackBlogRead(slug, title) {
  trackEvent('blog_read', { blog_slug: slug, blog_title: title });
}

export function trackCTAClick(label) {
  trackEvent('cta_click', { cta_label: label });
}

export function trackBlogLeadSubmit(service) {
  trackEvent('blog_lead_submit', { service_interest: service || 'general' });
}
