const express = require('express');
const { listUsers, createUser, changePassword, MIN_PASSWORD } = require('../users');
const { issueSession } = require('../auth');
const { formatTimestamp } = require('../format');

/**
 * Account management, reached from the navbar dropdown. Every route here sits
 * behind requireAuth (mounted in app.js), so req.user is always set.
 */
const router = express.Router();

async function renderUsers(req, res, { error = null, created = null, form = {} } = {}) {
  res.render('users', {
    user: req.user.username,
    accounts: await listUsers(),
    error,
    created,
    form: { username: form.username || '' },
    minPassword: MIN_PASSWORD,
    formatTimestamp,
  });
}

router.get('/users', async (req, res, next) => {
  try {
    await renderUsers(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/users', async (req, res, next) => {
  const { username, password, confirm } = req.body || {};
  try {
    const error = await createUser(String(username || '').trim(), password, confirm);
    if (error) {
      return await renderUsers(req, res, { error, form: { username } });
    }
    return await renderUsers(req, res, { created: String(username).trim() });
  } catch (err) {
    return next(err);
  }
});

router.get('/password', (req, res) => {
  res.render('password', {
    user: req.user.username,
    error: null,
    changed: false,
    minPassword: MIN_PASSWORD,
  });
});

router.post('/password', async (req, res, next) => {
  const { current, next: nextPassword, confirm } = req.body || {};
  try {
    const result = await changePassword(req.user.username, current, nextPassword, confirm);
    if (result.error) {
      return res.render('password', {
        user: req.user.username,
        error: result.error,
        changed: false,
        minPassword: MIN_PASSWORD,
      });
    }
    // The old cookie is now stale by design — re-issue it for this session.
    issueSession(res, result.user);
    return res.render('password', {
      user: req.user.username,
      error: null,
      changed: true,
      minPassword: MIN_PASSWORD,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
