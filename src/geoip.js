/**
 * Headers consulted for the client IP, most trustworthy first.
 *
 * This order matters: the duplicate-IP rule is only as good as this value. On
 * Vercel, `x-vercel-forwarded-for` and `x-real-ip` are written by the platform
 * and cannot be set by the caller, whereas `x-forwarded-for` may carry values
 * the caller supplied — so it is the last resort, for local/other hosting.
 *
 * Set TRUSTED_IP_HEADER to pin a single header and ignore the rest.
 */
const config = require('./config');

const HEADER_PRIORITY = ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for'];

function headerOrder() {
  return config.trustedIpHeader ? [config.trustedIpHeader.toLowerCase()] : HEADER_PRIORITY;
}

/**
 * Extract the real client IP, honouring reverse-proxy headers.
 */
function extractClientIp(req) {
  for (const name of headerOrder()) {
    const raw = req.headers[name];
    if (raw && String(raw).trim()) {
      // Chained headers list the original client first.
      return String(raw).split(',')[0].trim();
    }
  }
  if (config.trustedIpHeader) {
    return null; // pinned header absent — don't silently fall back
  }
  return req.socket.remoteAddress || null;
}

function isPrivateOrLocal(ip) {
  return ip.startsWith('127.')
    || ip.startsWith('10.')
    || ip.startsWith('192.168.')
    || ip.startsWith('172.16.')
    || ip === '0:0:0:0:0:0:0:1'
    || ip === '::1'
    || ip.toLowerCase() === 'localhost';
}

/**
 * Look up the country for a given IP using the free ip-api.com service.
 * Returns "Unknown" for private/loopback addresses or on any failure.
 */
async function lookupCountry(ip) {
  if (!ip || isPrivateOrLocal(ip)) {
    return 'Unknown';
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country`,
      { signal: AbortSignal.timeout(config.geoLookupTimeoutMs) },
    );
    if (!res.ok) {
      return 'Unknown';
    }
    const body = await res.json();
    if (body && body.status === 'success' && body.country) {
      return String(body.country);
    }
  } catch (e) {
    // network/service failure — fall through
  }
  return 'Unknown';
}

module.exports = { extractClientIp, lookupCountry };
