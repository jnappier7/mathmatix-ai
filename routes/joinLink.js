// routes/joinLink.js — /join/:code, the class link a teacher shares.
//
// The code waits in a short-lived cookie, so it survives whichever door the
// student takes:
//   • already signed in as a student → chat, with "Join this class?" ready
//   • new → sign-up with the code filled in (skipping the consumer onboarding
//     voice prompt — a class join is not a marketing funnel)
//   • has an account but is signed out → they can choose Log in; the chat
//     page picks the code up from the cookie (js/join-class.js clears it)
// A signed-in teacher/parent testing their own link goes home, never into a
// student sign-up.

const express = require('express');
const router = express.Router();
const { userHasRole } = require('../utils/roleQuery');

const CODE_RE = /^[A-Z0-9-]{3,24}$/;
const HOME = { teacher: '/teacher-dashboard.html', admin: '/admin-dashboard.html', parent: '/parent-dashboard.html' };

router.get('/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!CODE_RE.test(code)) return res.redirect(302, '/signup.html');
  res.cookie('mm_join_code', code, {
    httpOnly: false, // read by the chat page, then cleared
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  });
  const user = req.user;
  if (user && userHasRole(user, 'student')) return res.redirect(302, `/chat.html?join=${encodeURIComponent(code)}`);
  if (user) return res.redirect(302, HOME[user.role] || '/chat.html');
  return res.redirect(302, `/signup.html?code=${encodeURIComponent(code)}&skipOnboarding=1`);
});

module.exports = router;
module.exports.CODE_RE = CODE_RE;
