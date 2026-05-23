/**
 * Format a contact/organization label with optional reference in brackets.
 * @param {string} displayName
 * @param {string} [reference]
 * @returns {string}
 */
export function formatEntityLabel(displayName, reference) {
  const name = String(displayName || '').trim() || 'Unknown';
  const ref = String(reference || '').trim();
  return ref ? `${name} (${ref})` : name;
}

/**
 * Renders displayName with optional muted (reference) suffix — matches CRM list styling.
 */
export function EntityNameWithReference({ displayName, reference, nameStyle = {}, refStyle = {} }) {
  const name = String(displayName || '').trim() || 'Unknown';
  const ref = String(reference || '').trim();
  return (
    <>
      <span style={nameStyle}>{name}</span>
      {ref ? (
        <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 4, ...refStyle }}>
          ({ref})
        </span>
      ) : null}
    </>
  );
}
