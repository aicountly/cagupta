/** Return up to 2 uppercase initials from a name or email string. */
export function getInitials(nameOrEmail) {
  if (!nameOrEmail) return '??';
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return nameOrEmail.slice(0, 2).toUpperCase();
}
