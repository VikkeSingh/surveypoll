const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { requireAuth } = require('./auth');
const surveyRoutes = require('./routes/survey');
const apiRoutes = require('./routes/api');
const viewRoutes = require('./routes/views');
const adminRoutes = require('./routes/admin');

const app = express();

// Vercel (and any reverse proxy) terminates TLS upstream.
app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser(require('./config').sessionSecret));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Public survey-write endpoints (called by vendors/panels).
app.use(surveyRoutes);

// Dashboard + login pages.
app.use(viewRoutes);

// Account management + data APIs — login required.
app.use('/admin', requireAuth, adminRoutes);
app.use('/api', requireAuth, apiRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

const DB_UNREACHABLE = new Set([
  'MongoServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
]);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (DB_UNREACHABLE.has(err.name)) {
    console.error(
      `\n[surveypoll] Cannot reach MongoDB: ${err.message.split('\n')[0]}\n`
      + '  - Atlas? Add your current IP under Network Access '
      + '(Vercel has no fixed egress IPs, so it needs 0.0.0.0/0).\n'
      + '  - Check the credentials and cluster name in MONGODB_URI.\n',
    );
    return res.status(503).json({ error: 'database unavailable' });
  }
  console.error(err);
  return res.status(500).json({ error: 'internal server error' });
});

module.exports = app;
