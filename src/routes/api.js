const express = require('express');
const { filter } = require('../surveys');
const { formatTimestamp } = require('../format');

/**
 * Read-only endpoints that feed the dashboard: filtered listing + CSV report.
 */
const router = express.Router();

function filterParams(req) {
  const { projectId, status, uid, startDate, endDate } = req.query;
  return { projectId, status, uid, startDate, endDate };
}

function csv(value) {
  if (value == null) {
    return '';
  }
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

router.get('/records', async (req, res, next) => {
  try {
    const rows = await filter(filterParams(req));
    res.json(rows.map((r) => ({
      id: String(r._id),
      projectId: r.projectId,
      username: r.username,
      status: r.status,
      ipAddress: r.ipAddress,
      fingerprint: r.fingerprint || null,
      country: r.country,
      createAt: r.createAt,
    })));
  } catch (err) {
    next(err);
  }
});

router.get('/records/report', async (req, res, next) => {
  try {
    const rows = await filter(filterParams(req));

    const lines = ['S.NO,Project ID,Username,Status,IP Address,Device ID,Country,Create At'];
    rows.forEach((r, i) => {
      lines.push([
        i + 1,
        csv(r.projectId),
        csv(r.username),
        csv(r.status),
        csv(r.ipAddress),
        csv(r.fingerprint),
        csv(r.country),
        csv(formatTimestamp(r.createAt)),
      ].join(','));
    });

    res.set('Content-Disposition', 'attachment; filename=survey_report.csv');
    res.type('text/csv').send(`${lines.join('\n')}\n`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
