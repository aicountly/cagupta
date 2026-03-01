require('dotenv').config();
const express = require('express');
const cors = require('cors');
const emailRoutes = require('./routes/email.routes');
const clientRoutes = require('./routes/client.routes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/email', emailRoutes);
app.use('/api/clients', clientRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`CA Portal backend running on port ${PORT}`));
}

module.exports = app;
