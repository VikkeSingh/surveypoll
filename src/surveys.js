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
 * Store a survey event. Captures IP + country from the incoming request.
 *
 * One IP may be recorded once, globally and permanently: whichever status
 * arrives first claims that address. A repeat hit from an address already
 * present in the collection is rejected and stored nowhere.
 *
 * Returns { duplicate: true, ipAddress } or { duplicate: false, record }.
 */
async function record(uid, pid, status, req) {
  const ip = extractClientIp(req);
  const col = await records();

  if (ip) {
    const seen = await col.findOne({ ipAddress: ip }, { projection: { _id: 1 } });
    if (seen) {
      return { duplicate: true, ipAddress: ip };
    }
  }

  const country = await lookupCountry(ip);
  const doc = {
    projectId: pid,
    username: uid,
    status,
    ipAddress: ip,
    country,
    createAt: new Date(),
  };

  const result = await col.insertOne(doc);
  return { duplicate: false, record: { ...doc, _id: result.insertedId } };
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

module.exports = { record, filter };
