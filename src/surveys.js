const { records } = require('./db');
const { extractClientIp, lookupCountry } = require('./geoip');
const { zonedDayStart } = require('./format');

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function blank(s) {
  return s == null || String(s).trim() === '';
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive exact match, mirroring the old equalsIgnoreCase filter. */
function eqIgnoreCase(value) {
  return { $regex: `^${escapeRegex(String(value).trim())}$`, $options: 'i' };
}

/**
 * `YYYY-MM-DD` -> the instant that day starts in the display timezone, or null
 * when absent/unparseable. `daysOffset` shifts by whole days.
 */
function parseDate(value, daysOffset = 0) {
  if (blank(value) || !DATE_ONLY.test(String(value).trim())) {
    return null;
  }
  const [y, m, d] = String(value).trim().split('-').map(Number);
  const start = zonedDayStart(y, m, d, daysOffset);
  return Number.isNaN(start.getTime()) ? null : start;
}

/**
 * The three duplicate rules, each scoped globally and permanently: whichever
 * hit arrives first claims the value, across every project and for good.
 * Checked in this order, first match wins, and a match is stored nowhere.
 *
 *   uid          one respondent ID may be recorded once. Exact and free — the
 *                panel already gives us the ID, so this is the strongest rule.
 *   fingerprint  one device may be recorded once. Catches a respondent who
 *                comes back under a fresh uid.
 *   ipAddress    one address may be recorded once. Weakest of the three:
 *                carrier NAT and office networks put many people behind one
 *                address, so it is checked last, purely so the reported reason
 *                names a better rule when one applies.
 *
 * Returns { duplicate: true, reason } or null.
 */
async function findDuplicate(col, { uid, ip, fingerprint }) {
  const projection = { projection: { _id: 1 } };

  // usernameLower exists only on rows this version wrote; the exact `username`
  // arm covers the legacy rows, which were stored verbatim.
  const seenUid = await col.findOne({
    $or: [{ usernameLower: normalizeUid(uid) }, { username: uid }],
  }, projection);
  if (seenUid) {
    return { duplicate: true, reason: 'uid' };
  }

  if (fingerprint) {
    const seenDevice = await col.findOne({ fingerprint }, projection);
    if (seenDevice) {
      return { duplicate: true, reason: 'fingerprint' };
    }
  }

  if (ip) {
    const seenIp = await col.findOne({ ipAddress: ip }, projection);
    if (seenIp) {
      return { duplicate: true, reason: 'ip' };
    }
  }

  return null;
}

function normalizeUid(uid) {
  return String(uid).trim().toLowerCase();
}

/** Map a unique-index violation back onto the rule that caught it. */
function reasonFromIndexError(err) {
  const key = (err && err.keyPattern) || {};
  if (key.usernameLower) return 'uid';
  if (key.fingerprint) return 'fingerprint';
  return 'uid';
}

/**
 * The rules that need no data from the browser. Run before the fingerprint
 * round trip so an already-seen uid or IP is rejected on the first request,
 * without asking the respondent's browser to do any work.
 */
async function precheck(uid, req) {
  const ip = extractClientIp(req);
  const col = await records();
  const duplicate = await findDuplicate(col, { uid, ip });
  return duplicate ? { ...duplicate, ipAddress: ip } : { duplicate: false, ipAddress: ip };
}

/**
 * Store a survey event. Captures IP + country from the request and the device
 * fingerprint measured by the browser (null when the client could not produce
 * one — no JS, or the page timed out waiting).
 *
 * Returns { duplicate: true, reason, ipAddress, fingerprint }
 *      or { duplicate: false, record }.
 */
async function record(uid, pid, status, req, fingerprint) {
  const ip = extractClientIp(req);
  const col = await records();
  const device = blank(fingerprint) ? null : String(fingerprint).trim();

  const duplicate = await findDuplicate(col, { uid, ip, fingerprint: device });
  if (duplicate) {
    return { ...duplicate, ipAddress: ip, fingerprint: device };
  }

  const country = await lookupCountry(ip);
  const doc = {
    projectId: pid,
    username: uid,
    usernameLower: normalizeUid(uid),
    status,
    ipAddress: ip,
    fingerprint: device,
    country,
    createAt: new Date(),
  };

  try {
    const result = await col.insertOne(doc);
    return { duplicate: false, record: { ...doc, _id: result.insertedId } };
  } catch (err) {
    // Two hits carrying the same uid (or device) can both clear findDuplicate
    // before either inserts. The unique indexes from db.js are what actually
    // settle it; the loser lands here.
    if (err && err.code === 11000) {
      return { duplicate: true, reason: reasonFromIndexError(err), ipAddress: ip, fingerprint: device };
    }
    throw err;
  }
}

/**
 * Filtered listing used by both the REST API and the dashboard page.
 * Dates are inclusive on both ends, interpreted in the display timezone.
 */
async function filter({ projectId, status, uid, startDate, endDate } = {}) {
  const query = {};

  if (!blank(projectId)) query.projectId = eqIgnoreCase(projectId);
  if (!blank(status)) query.status = eqIgnoreCase(status);
  if (!blank(uid)) query.username = eqIgnoreCase(uid);

  const start = parseDate(startDate);
  const end = parseDate(endDate, 1); // exclusive upper bound: start of the next day
  if (start || end) {
    query.createAt = {};
    if (start) query.createAt.$gte = start;
    if (end) query.createAt.$lt = end;
  }

  const col = await records();
  return col.find(query).sort({ createAt: -1 }).toArray();
}

module.exports = { precheck, record, filter };
