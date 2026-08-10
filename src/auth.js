const { findByUsername, sessionToken } = require('./users');

const COOKIE = 'sp_auth';
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12h

/**
 * The cookie carries "username:token", where token is derived from the current
 * password hash — so changing a password signs out that user's other sessions.
 * It is signed with SESSION_SECRET, so neither half can be forged.
 */
function issueSession(res, user) {
  res.cookie(COOKIE, `${user.username}:${sessionToken(user)}`, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

/** Resolve the cookie to a live user record, or null. */
async function currentUser(req) {
  const raw = req.signedCookies && req.signedCookies[COOKIE];
  if (!raw) {
    return null;
  }
  const idx = raw.lastIndexOf(':');
  if (idx < 1) {
    return null;
  }
  const username = raw.slice(0, idx);
  const token = raw.slice(idx + 1);

  const user = await findByUsername(username);
  if (!user || sessionToken(user) !== token) {
    return null;
  }
  return user;
}

/**
 * Gate for the dashboard, the admin pages and the data APIs. Browser requests
 * get redirected to the login page; anything under /api gets a 401 instead.
 */
async function requireAuth(req, res, next) {
  try {
    const user = await currentUser(req);
    if (user) {
      req.user = user;
      res.locals.user = user.username;
      return next();
    }
  } catch (err) {
    return next(err);
  }
  // req.path is relative to the mount point, so rebuild the full path.
  if (`${req.baseUrl}${req.path}`.startsWith('/api/')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return res.redirect('/login');
}

module.exports = { COOKIE, issueSession, clearSession, currentUser, requireAuth };
