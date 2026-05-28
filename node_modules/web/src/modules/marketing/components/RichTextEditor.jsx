import { useRef, useEffect, useCallback } from 'react';

/**
 * Tags whose content we preserve when sanitizing a paste.
 * Everything else is unwrapped (content kept, tag removed).
 */
const SAFE_TAGS = new Set([
  'p', 'br', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'a',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);

/**
 * Sanitize HTML from clipboard:
 *  - Remove dangerous elements entirely (script, style, iframe, …)
 *  - Strip all attributes except href on <a>
 *  - Strip inline styles and class names (so Word / Google Docs styles don't bleed in)
 */
function sanitizePaste(html) {
  const root = document.createElement('div');
  root.innerHTML = html;

  root.querySelectorAll(
    'script, style, iframe, object, embed, form, input, select, textarea, button, meta, link, head'
  ).forEach(el => el.remove());

  root.querySelectorAll('*').forEach(el => {
    const tag = el.tagName.toLowerCase();

    if (!SAFE_TAGS.has(tag)) {
      el.replaceWith(...el.childNodes);
      return;
    }

    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const keep =
        (tag === 'a' && name === 'href' && !attr.value.startsWith('javascript:'));
      if (!keep) el.removeAttribute(attr.name);
    });

    if (tag === 'a') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener');
    }
  });

  return root.innerHTML;
}

// ── Toolbar button ────────────────────────────────────────────────────────────

function TBtn({ title, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: '3px 9px', fontSize: 12, fontWeight: 600,
        border: '1px solid #e2e8f0', borderRadius: 5,
        background: '#f8fafc', color: '#334155',
        cursor: 'pointer', userSelect: 'none', lineHeight: 1.5,
        gap: 3,
      }}
    >
      {children}
    </button>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────

/**
 * Rich-text editor backed by a contenteditable div.
 *
 * Props:
 *   defaultValue  – Initial HTML content (set once on mount). Use a `key` prop
 *                   on the parent to force re-mount when switching articles.
 *   onChange(html) – Called whenever content changes; receives raw innerHTML.
 *   placeholder   – Placeholder text shown when the editor is empty.
 *   style         – Extra styles on the outer wrapper.
 *   minHeight     – Minimum editor area height (default 320px).
 */
export function RichTextEditor({ defaultValue = '', onChange, placeholder, style, minHeight = 320 }) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = defaultValue;
    }
    // Only on mount — use a `key` on this component to re-initialise
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => {
    onChange?.(editorRef.current?.innerHTML ?? '');
  }, [onChange]);

  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    const content = html
      ? sanitizePaste(html)
      : text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>');

    document.execCommand('insertHTML', false, content);
    emit();
  }, [emit]);

  const cmd = useCallback((command, arg = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  }, [emit]);

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', overflow: 'hidden', ...style }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', gap: 4, padding: '6px 8px',
        borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap',
        background: '#f8fafc',
      }}>
        <TBtn title="Bold (Ctrl+B)" onClick={() => cmd('bold')}><strong>B</strong></TBtn>
        <TBtn title="Italic (Ctrl+I)" onClick={() => cmd('italic')}><em style={{ fontStyle: 'italic' }}>I</em></TBtn>
        <span style={{ width: 1, background: '#e2e8f0', margin: '2px 2px' }} />
        <TBtn title="Heading 2" onClick={() => cmd('formatBlock', 'h2')}>H2</TBtn>
        <TBtn title="Heading 3" onClick={() => cmd('formatBlock', 'h3')}>H3</TBtn>
        <span style={{ width: 1, background: '#e2e8f0', margin: '2px 2px' }} />
        <TBtn title="Bullet list" onClick={() => cmd('insertUnorderedList')}>• List</TBtn>
        <TBtn title="Numbered list" onClick={() => cmd('insertOrderedList')}>1. List</TBtn>
        <span style={{ width: 1, background: '#e2e8f0', margin: '2px 2px' }} />
        <TBtn title="Remove formatting" onClick={() => cmd('removeFormat')}>Clear</TBtn>
      </div>

      {/* ── Editable area ── */}
      <div style={{ position: 'relative' }}>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onPaste={handlePaste}
          style={{
            minHeight,
            padding: '12px 14px',
            fontSize: 14,
            lineHeight: 1.75,
            color: '#1e293b',
            outline: 'none',
            overflowY: 'auto',

            // Style formatted content inside the editor
          }}
        />
        {/* CSS for editor content + placeholder */}
        <style>{`
          [contenteditable]:empty:before {
            content: attr(data-placeholder);
            color: #94a3b8;
            pointer-events: none;
          }
          [contenteditable] h1 { font-size: 1.6em; font-weight: 800; margin: 0.6em 0 0.3em; color: #0f172a; }
          [contenteditable] h2 { font-size: 1.3em; font-weight: 700; margin: 0.8em 0 0.3em; color: #0f172a; }
          [contenteditable] h3 { font-size: 1.1em; font-weight: 700; margin: 0.7em 0 0.25em; color: #1e293b; }
          [contenteditable] p  { margin: 0 0 0.75em; }
          [contenteditable] ul, [contenteditable] ol { padding-left: 1.4em; margin: 0 0 0.75em; }
          [contenteditable] li { margin-bottom: 0.25em; }
          [contenteditable] strong, [contenteditable] b { font-weight: 700; }
          [contenteditable] em, [contenteditable] i { font-style: italic; }
          [contenteditable] a { color: var(--portal-primary); text-decoration: underline; }
          [contenteditable] blockquote { border-left: 3px solid #e2e8f0; padding-left: 1em; color: #64748b; margin: 0.5em 0; }
          [contenteditable] pre, [contenteditable] code { font-family: monospace; background: #f1f5f9; padding: 2px 5px; border-radius: 4px; }
        `}</style>
      </div>

      {/* Placeholder overlay (works even when editor is not empty) */}
      {placeholder && (
        <style>{`
          .rte-empty [contenteditable]:not(:focus)::before {
            content: "${placeholder.replace(/"/g, '\\"')}";
            color: #94a3b8; position: absolute; top: 12px; left: 14px; pointer-events: none;
          }
        `}</style>
      )}
    </div>
  );
}
