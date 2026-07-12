'use strict';
/* ============================================================
   presenceCommand.schema.js — the tutor's "body" on the board.

   A separate command layer so presence logic never mixes into
   math elements (spec §3.9). Every presence command is SKIPPABLE
   and has a reduced-motion static equivalent; presence animation
   must never block student input.
   ============================================================ */

const { makeValidator } = require('./_validator');
const { PRESENCE_COMMANDS } = require('../constants/commandTypes');

const PresenceCommand = makeValidator('PresenceCommand', {
  type:            { type: 'string', required: true, enum: PRESENCE_COMMANDS },
  targetElementId: { type: 'string', required: false }, // anchor to a semantic target, not pixels
  anchor:          { type: 'string', required: false }, // named sub-region of the target
  token:           { type: 'string', required: false }, // e.g. the term to underline
  region:          { type: 'string', required: false },
  durationMs:      { type: 'number', required: false }, // for 'pause'
});

module.exports = { PresenceCommand };
