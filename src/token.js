const crypto = require('crypto');
const config = require('./config');

/**
 * Short-lived signed tokens for the fingerprint round trip.
 *
 * The survey endpoints hand the browser a page that measures the device and
 * posts the result back. That post carries the uid/pid/status it should record,
 * so it has to be tamper-proof: without a signature anyone could POST
 * /survey/commit and write an arbitrary "completed" row.
 */

const TTL_MS = 10 * 60 * 1000;

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function hmac(body) {
  return b64url(crypto.createHmac('sha256', config.sessionSecret).update(body).digest());
}

/** Sign a payload object. `exp` is added here and enforced by verify(). */
function sign(payload) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + TTL_MS }));
  return `${body}.${hmac(body)}`;
}

/** Returns the payload, or null if the token is malformed, forged or expired. */
function verify(token) {
  if (typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [body, sig] = parts;
  const expected = hmac(body);
  if (sig.length !== expected.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch (err) {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) {
    return null;
  }
  return payload;
}

module.exports = { sign, verify };
