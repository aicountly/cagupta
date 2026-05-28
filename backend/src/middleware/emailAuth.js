/**
 * Requires X-Email-Api-Key header when EMAIL_API_KEY is set.
 * When unset (dev), routes remain open for local testing.
 */
function requireEmailApiKey(req, res, next) {
  const expected = process.env.EMAIL_API_KEY;
  if (!expected) {
    return next();
  }
  const provided = req.get('X-Email-Api-Key') || req.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  return next();
}

module.exports = { requireEmailApiKey };
