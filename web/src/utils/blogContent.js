/**
 * Shared blog content utilities.
 * Used by the RichTextEditor (to initialise legacy markdown posts as HTML)
 * and by the public blog renderers (to detect HTML vs markdown content).
 */

/** Returns true when content has already been stored as HTML. */
export function isHtml(str) {
  return typeof str === 'string' && /<[a-z][\s\S]*>/i.test(str);
}

/**
 * Convert plain-text markdown (## headings, **bold**, bullet lists, etc.)
 * to clean semantic HTML suitable for the rich-text editor or public display.
 */
export function markdownToHtml(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const out = [];
  let listBuf = [];
  let ordBuf = [];

  function flush() {
    if (listBuf.length) {
      out.push(`<ul>${listBuf.map(i => `<li>${i}</li>`).join('')}</ul>`);
      listBuf = [];
    }
    if (ordBuf.length) {
      out.push(`<ol>${ordBuf.map(i => `<li>${i}</li>`).join('')}</ol>`);
      ordBuf = [];
    }
  }

  function inline(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('### ')) {
      flush(); out.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      flush(); out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      flush(); out.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (/^[-*] /.test(line)) {
      ordBuf.length && flush();
      listBuf.push(inline(line.slice(2)));
    } else if (/^\d+\. /.test(line)) {
      listBuf.length && flush();
      ordBuf.push(inline(line.replace(/^\d+\. /, '')));
    } else if (line.trim() === '') {
      flush();
    } else {
      flush();
      out.push(`<p>${inline(line)}</p>`);
    }
  }

  flush();
  return out.join('');
}
