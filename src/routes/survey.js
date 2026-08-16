const express = require('express');
const { precheck, record } = require('../surveys');
const { sign, verify } = require('../token');

/**
 * The four public endpoints. They are called from anywhere (survey vendor
 * redirects, panels, etc.), persist a record with the given status, and render
 * a thank-you page for the respondent.
 *
 *   /survey/complete?uid=xxx&pid=xxx
 *   /survey/terminate?uid=xxx&pid=xxx
 *   /quotafull?uid=xxx&pid=xxx
 *   /security-terminate?uid=xxx&pid=xxx
 *
 * Each is a two-step exchange, because the device fingerprint can only be
 * measured by the browser and none of it exists yet when the redirect lands:
 *
 *   1. GET  — reject on uid or IP if we can already tell, otherwise render the
 *             collect page carrying a signed token for what to write.
 *   2. POST /survey/commit — re-check everything including the fingerprint,
 *             then insert and render the thank-you page.
 *
 * The write only ever happens in step 2, so a respondent who bounces off the
 * collect page is never recorded and can retry on the same link.
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

function renderDuplicate(res, uid, pid, outcome) {
  return res.status(409).render('duplicate', {
    uid,
    pid,
    reason: outcome.reason,
    ipAddress: outcome.ipAddress,
    fingerprint: outcome.fingerprint || null,
  });
}

function unavailable(res) {
  return res.status(503).render('notice', {
    title: 'Thank You!',
    message: 'Your response could not be saved right now. Please try again in a moment.',
  });
}

function handler(status) {
  return async (req, res) => {
    const { uid, pid } = req.query;
    if (!uid || !pid) {
      return res.status(400).render('notice', {
        title: 'Something went wrong',
        message: 'This link is missing the uid or pid parameter. Please return to the survey and try again.',
      });
    }

    const uidStr = String(uid);
    const pidStr = String(pid);
    try {
      const seen = await precheck(uidStr, req);
      if (seen.duplicate) {
        return renderDuplicate(res, uidStr, pidStr, seen);
      }
      return res.render('collect', {
        token: sign({ u: uidStr, p: pidStr, s: status }),
      });
    } catch (err) {
      console.error(err);
      return unavailable(res);
    }
  };
}

/**
 * Step 2. Everything about what to write comes from the signed token, never
 * from the posted fields — otherwise this endpoint would let anyone record an
 * arbitrary uid/pid/status. The fingerprint is the one value the client is
 * trusted to supply, and it can only ever cause a rejection.
 */
router.post('/survey/commit', async (req, res) => {
  const body = req.body || {};
  const payload = verify(body.token);
  if (!payload) {
    return res.status(400).render('notice', {
      title: 'Something went wrong',
      message: 'This page expired before your response could be saved. Please return to the survey and try again.',
    });
  }

  try {
    const outcome = await record(payload.u, payload.p, payload.s, req, body.fingerprint);
    if (outcome.duplicate) {
      return renderDuplicate(res, payload.u, payload.p, outcome);
    }
    return res.render('thankyou', {
      record: outcome.record,
      statusLabel: STATUS_LABELS[payload.s] || payload.s,
    });
  } catch (err) {
    console.error(err);
    return unavailable(res);
  }
});

router.get('/survey/complete', handler('completed'));
router.get('/survey/terminate', handler('terminated'));
router.get('/quotafull', handler('quotafull'));
router.get('/security-terminate', handler('security-terminate'));

module.exports = router;
