require('dotenv').config();
const express = require('express');
const emailRoutes = require('./routes/email.routes');
const { requireEmailApiKey } = require('./middleware/emailAuth');

const app = express();
app.use(express.json());

app.use('/api/email', requireEmailApiKey, emailRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  const HOST = process.env.HOST || '127.0.0.1';
  app.listen(PORT, HOST, () => console.log(`CA Portal backend running on ${HOST}:${PORT}`));
}

module.exports = app;
