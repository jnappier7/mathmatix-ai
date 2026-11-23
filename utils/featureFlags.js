/**
 * featureFlags.js — server-controlled client feature flags.
 *
 * chat.html seeds window.MM_FEATURES from hardcoded defaults; until now the
 * only "kill switch" was editing that line and redeploying. This serves
 * GET /api/features.js — a tiny synchronous script loaded BEFORE the seed —
 * so a Render env var flips a flag with a dashboard save instead of a code
 * change (the owner's exact action: livingWorkspace=live in the env screen).
 *
 * Precedence: env override → chat.html default (the seed's Object.assign
 * merges the pre-set window.MM_FEATURES over its defaults). Absent or
 * invalid env values emit nothing — the defaults stand.
 *
 * SECURITY: env values are matched against whitelists and only whitelisted
 * LITERALS are emitted — nothing from the environment is interpolated raw
 * into the script, so a mistyped value can never inject JS.
 */
'use strict';

const { AsyncLocalStorage } = require('async_hooks');

// One scope per request: is the Work Board on for THIS user as a preview?
// Opened by boardPreviewScope (mounted after passport + impersonation).
const previewScope = new AsyncLocalStorage();

const LWS_MODES = ['off', 'dev', 'beta', 'live'];

function boolFlag(v) {
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return null;
}

/**
 * Is the Work Board on? OFF unless WORK_BOARD says otherwise (2026-10).
 *
 * The board was the dock above the composer where the tutor's <BOARD/> tags
 * rendered as cards. With it off, the tutor writes the math in its message and
 * the dock never mounts; the server still pins the problem silently from chat
 * text (grading anchor + teacher live view). One env var is the whole switch:
 * the server reads it here for the prompt, and the client reads the same value
 * through /api/features.js for the dock — so the two can never disagree.
 *
 * PREVIEW (2026-11-23, owner: "how can I see it without the world seeing
 * it?"): WORK_BOARD_PREVIEW lists accounts — emails or user ids, comma-
 * separated — for whom the board is on while it is off for everyone else.
 * boardPreviewScope decides it once per request from req.user and every reader
 * of this function inside that request (the prompt, structured mode, the board
 * tool, the per-turn board block, /api/features.js) gets the same answer, so
 * server and client still cannot disagree. Outside a request (voice sockets,
 * crons, the landing-page trial with no user) only the global switch counts.
 * An explicitly passed `env` is a test or a caller asking about that env — the
 * request scope is consulted only for the real process.env.
 *
 * @param {object} env - process.env (injectable for tests)
 * @returns {boolean}
 */
function isWorkBoardEnabled(env = process.env) {
  const v = String(env.WORK_BOARD || '').trim().toLowerCase();
  if (v === 'on' || v === 'true' || v === '1') return true;
  if (env !== process.env) return false;
  const scope = previewScope.getStore();
  return !!(scope && scope.workBoard === true);
}

/** The accounts named in WORK_BOARD_PREVIEW, lower-cased. */
function boardPreviewList(env = process.env) {
  return new Set(String(env.WORK_BOARD_PREVIEW || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * Is this account on the preview list? Matched on email or user id, exactly —
 * no patterns, no roles: a preview is a short list of named people.
 */
function isBoardPreviewUser(user, env = process.env) {
  if (!user) return false;
  const list = boardPreviewList(env);
  if (list.size === 0) return false;
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  const id = user._id != null ? String(user._id).toLowerCase() : '';
  return (!!email && list.has(email)) || (!!id && list.has(id));
}

/**
 * Express middleware: open the preview scope for this request. Mount AFTER
 * passport and impersonation, so an admin viewing a student's chat gets the
 * student's board state, not their own.
 */
function boardPreviewScope(req, res, next) {
  let on = false;
  try { on = isBoardPreviewUser(req.user || null); } catch { on = false; }
  return previewScope.run({ workBoard: on }, () => next());
}

/** Run `fn` as if inside a request for a preview (or non-preview) account. Tests. */
function runWithBoardPreview(on, fn) {
  return previewScope.run({ workBoard: on === true }, fn);
}

/**
 * @param {object} env - process.env (injectable for tests)
 * @returns {string} JavaScript source for /api/features.js
 */
function buildFeaturesScript(env = process.env) {
  const flags = {};

  // Render env keys are conventionally SCREAMING_SNAKE; also accept the
  // camelCase spelling since that is what exists in the dashboard today.
  const lws = env.LIVING_WORKSPACE || env.livingWorkspace;
  if (typeof lws === 'string' && LWS_MODES.includes(lws.trim())) {
    flags.livingWorkspace = lws.trim();
  }

  const courses = boolFlag(env.COURSES_FEATURE || env.courses);
  if (courses !== null) flags.courses = courses;

  // Always emitted: the server is the source of truth for the board, because
  // the prompt (server) and the dock (client) must agree.
  flags.workBoard = isWorkBoardEnabled(env);

  const body = Object.keys(flags).length
    ? `window.MM_FEATURES = Object.assign(window.MM_FEATURES || {}, ${JSON.stringify(flags)});`
    : 'window.MM_FEATURES = window.MM_FEATURES || {};';
  return '// server feature-flag overrides — see utils/featureFlags.js\n' + body + '\n';
}

module.exports = {
  buildFeaturesScript, isWorkBoardEnabled, LWS_MODES,
  boardPreviewScope, isBoardPreviewUser, boardPreviewList, runWithBoardPreview,
};
