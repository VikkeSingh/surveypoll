const express = require('express');
const { record } = require('../surveys');

/**
 * The four public endpoints. They are called from anywhere (survey vendor
 * redirects, panels, etc.), persist a record with the given status, and render
 * a thank-you page for the respondent.
 *
 *   /survey/complete?uid=xxx&pid=xxx
 *   /survey/terminate?uid=xxx&pid=xxx
 *   /quotafull?uid=xxx&pid=xxx
 *   /security-terminate?uid=xxx&pid=xxx
 */
const router = express.Router();

// Reads naturally in "Your survey has been ___." The table still shows the raw
// stored status, so it matches the dashboard and the CSV export.
const STATUS_LABELS = {
  completed: 'completed',
  terminated: 'terminated',
  quotafull: 'closed — the quota is already full',
  'security-terminate': 'terminated by our security checks',
};

function handler(status) {
  return async (req, res) => {
    const { uid, pid } = req.query;
    if (!uid || !pid) {
      return res.status(400).render('notice', {
        title: 'Something went wrong',
        message: 'This link is missing the uid or pid parameter. Please return to the survey and try again.',
      });
    }
    try {
      const outcome = await record(String(uid), String(pid), status, req);
      if (outcome.duplicate) {
        return res.status(409).render('duplicate', {
          uid: String(uid),
          pid: String(pid),
          ipAddress: outcome.ipAddress,
        });
      }
      return res.render('thankyou', {
        record: outcome.record,
        statusLabel: STATUS_LABELS[status] || status,
      });
    } catch (err) {
      console.error(err);
      return res.status(503).render('notice', {
        title: 'Thank You!',
        message: 'Your response could not be saved right now. Please try again in a moment.',
      });
    }
  };
}

router.get('/survey/complete', handler('completed'));
router.get('/survey/terminate', handler('terminated'));
router.get('/quotafull', handler('quotafull'));
router.get('/security-terminate', handler('security-terminate'));

module.exports = router;
