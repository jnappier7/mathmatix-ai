// Re-export shim — the LLM tutor-reply judges moved to utils/replyLlmJudges.js
// so the production transcript miner can share them without prod code importing
// from tests/ (same split as tests/eval/judges.js → utils/replyJudges.js).
// Live-tier eval files keep requiring './llmJudges'; edit the judges THERE.
'use strict';

module.exports = require('../../utils/replyLlmJudges');
