const express = require('express');
const { filter } = require('../surveys');
const { formatTimestamp } = require('../format');
const { authenticate } = require('../users');
const { issueSession, clearSession, currentUser, requireAuth } = require('../auth');

/**
 * Login pages plus the server-side rendered dashboard. The dashboard reuses the
 * same filter() the REST API uses and hands the rows to an EJS template.
 */
const router = express.Router();

router.get('/login', async (req, res, next) => {
  try {
    if (await currentUser(req)) {
      return res.redirect('/');
    }
  } catch (err) {
    return next(err);
  }
  return res.render('login', {
    error: req.query.error != null,
    loggedOut: req.query.logout != null,
  });
});

router.post('/login', async (req, res, next) => {
  const { username, password } = req.body || {};
  try {
    const user = await authenticate(username, password);
    if (!user) {
      return res.redirect('/login?error');
    }
    issueSession(res, user);
    return res.redirect('/');
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', (req, res) => {
  clearSession(res);
  return res.redirect('/login?logout');
});

router.get('/', requireAuth, async (req, res, next) => {
  const { projectId, status, uid, startDate, endDate } = req.query;
  try {
    const records = await filter({ projectId, status, uid, startDate, endDate });
    res.render('dashboard', {
      user: req.user.username,
      records,
      projectId: projectId || '',
      status: status || '',
      uid: uid || '',
      startDate: startDate || '',
      endDate: endDate || '',
      formatTimestamp,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
