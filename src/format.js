/**
 * Timestamps are stored as real UTC instants; display and date-range filtering
 * both happen in DISPLAY_TIMEZONE so the dashboard and the filters agree.
 */
const TZ = require('./config').displayTimezone;

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function partsOf(date) {
  const out = {};
  for (const { type, value } of PARTS.formatToParts(date)) {
    out[type] = value;
  }
  // Some engines emit hour "24" for midnight under hour12:false.
  out.hour = String(Number(out.hour) % 24).padStart(2, '0');
  return out;
}

/** UTC offset of `date` in the display timezone, in milliseconds. */
function offsetMs(date) {
  const p = partsOf(date);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** `yyyy-MM-dd HH:mm:ss` in the display timezone. */
function formatTimestamp(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const p = partsOf(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * The UTC instant at which the given calendar day starts in the display
 * timezone. `daysOffset` shifts by whole days (used for the exclusive end).
 */
function zonedDayStart(year, month, day, daysOffset = 0) {
  const wallClock = Date.UTC(year, month - 1, day + daysOffset);
  // Two passes so a DST transition on the boundary day still resolves.
  let ts = wallClock - offsetMs(new Date(wallClock));
  ts = wallClock - offsetMs(new Date(ts));
  return new Date(ts);
}

module.exports = { TZ, formatTimestamp, zonedDayStart };
