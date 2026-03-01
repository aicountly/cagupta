require('dotenv').config();
const express = require('express');
const emailRoutes = require('./routes/email.routes');

const app = express();
app.use(express.json());

app.use('/api/email', emailRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`CA Portal backend running on port ${PORT}`));
}

module.exports = app;
