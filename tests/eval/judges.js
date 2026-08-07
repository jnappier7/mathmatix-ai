/**
 * TUTOR-REPLY JUDGES — re-export shim.
 *
 * The judges moved to utils/replyJudges.js so the LIVE pipeline can run them on
 * every persisted tutor turn (Stage 5g telemetry → utils/judgeMetrics.js), not
 * just on eval scenarios. One detector set, two consumers — edit the judges
 * THERE. This shim keeps every eval-harness and unit-test import path working.
 */

'use strict';

module.exports = require('../../utils/replyJudges');
