import { useEffect } from 'react';

const SITE_NAME = 'CA Rahul Gupta — Chartered Accountants';
const DEFAULT_IMAGE = 'https://carahulgupta.in/cropped_logo.png';

/**
 * Sets per-page <title>, <meta name="description">, and Open Graph / Twitter
 * Card tags in document.head. Cleans up on unmount so subsequent pages always
 * get fresh tags.
 *
 * @param {object} options
 * @param {string}  options.title       - Page-specific title (appended with " | CA Rahul Gupta")
 * @param {string}  options.description - Unique meta description for this page (≤160 chars)
 * @param {string} [options.image]      - Absolute URL for og:image (falls back to logo)
 * @param {string} [options.type]       - og:type (default: "website")
 * @param {string} [options.url]        - Canonical URL (default: current href)
 */
export default function useSeo({ title, description, image, type = 'website', url } = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
    const ogImage   = image || DEFAULT_IMAGE;
    const ogUrl     = url   || window.location.href;

    // ── <title> ──────────────────────────────────────────────────────────────
    const prevTitle = document.title;
    document.title  = fullTitle;

    // ── helper ───────────────────────────────────────────────────────────────
    function setMeta(attr, key, content) {
      if (!content) return null;
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      const isNew = !el;
      if (isNew) {
        el = document.createElement('meta');
        document.head.appendChild(el);
      }
      el.setAttribute(attr, key);
      el.setAttribute('content', content);
      return isNew ? el : null;
    }

    // ── meta description ─────────────────────────────────────────────────────
    // The description tag already exists in index.html; just update its content.
    const descEl = document.querySelector('meta[name="description"]');
    const prevDesc = descEl?.getAttribute('content') ?? '';
    if (descEl && description) descEl.setAttribute('content', description);

    // ── Open Graph ───────────────────────────────────────────────────────────
    const inserted = [
      setMeta('property', 'og:type',        type),
      setMeta('property', 'og:site_name',   SITE_NAME),
      setMeta('property', 'og:url',         ogUrl),
      setMeta('property', 'og:title',       fullTitle),
      setMeta('property', 'og:description', description || ''),
      setMeta('property', 'og:image',       ogImage),
      // Twitter Card
      setMeta('name', 'twitter:card',        'summary_large_image'),
      setMeta('name', 'twitter:title',       fullTitle),
      setMeta('name', 'twitter:description', description || ''),
      setMeta('name', 'twitter:image',       ogImage),
    ].filter(Boolean);

    return () => {
      document.title = prevTitle;
      if (descEl) descEl.setAttribute('content', prevDesc);
      inserted.forEach(el => el.parentNode?.removeChild(el));
    };
  }, [title, description, image, type, url]);
}
