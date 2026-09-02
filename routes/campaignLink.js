// routes/campaignLink.js — tracked short links for printed materials.
//
// A QR code on a banner, flyer, or program ad encodes /go/<campaign>
// (e.g. mathmatix.ai/go/field). The route 302s to the landing page with UTM
// parameters, so GA4 attributes the visit to the campaign — turning printed
// marketing from unmeasurable into an experiment. Born of an $800 field
// banner whose QR encoded the bare domain: its scans land as anonymous
// direct traffic forever. Every print after it gets its own slug here.
//
// Deliberately tiny: no campaign registry, no per-slug config. Any slug that
// passes validation redirects — a printed code must never dead-end on a 404
// because nobody created a database row first. An unknown-but-valid slug
// still lands, still counts, and shows up named in GA4.

const express = require('express');
const router = express.Router();
const { recordConversionEvent } = require('../utils/conversionEvents');

// Slug: 1-40 chars, letters/digits/hyphen/underscore. Anything else gets a
// plain redirect home — a human holding a phone must always land somewhere,
// but nothing unvalidated is ever reflected into the redirect URL.
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

router.get('/:campaign', (req, res) => {
  const raw = String(req.params.campaign || '');
  if (!SLUG_RE.test(raw)) {
    return res.redirect(302, '/');
  }
  const campaign = raw.toLowerCase();

  // Fire-and-forget by contract — telemetry must never slow a scan.
  recordConversionEvent('campaign_scan', { context: { campaign } });

  return res.redirect(
    302,
    `/?utm_source=qr&utm_medium=offline&utm_campaign=${encodeURIComponent(campaign)}`
  );
});

module.exports = router;
