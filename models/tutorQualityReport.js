// models/tutorQualityReport.js
// One document per transcript-mining run (utils/transcriptMiner.js). Persisted
// — not an in-memory ring like verifyMetrics — because the nightly sweep runs
// in a SEPARATE cron process from the web server; the admin endpoint reads the
// latest saved run. Findings are candidates for human review, never
// auto-actioned, and all transcript excerpts inside are PII-anonymized at
// write time.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const tutorQualityReportSchema = new Schema({
    runAt: { type: Date, default: Date.now, index: true },
    trigger: { type: String, enum: ['cron', 'admin', 'manual'], default: 'cron' },

    windowHours: { type: Number, default: 24 },
    windowStart: { type: Date },
    windowEnd: { type: Date },
    params: { type: Schema.Types.Mixed, default: {} },

    // { conversationsScanned, turnsJudged, totalViolations, rankedJudges: [...] }
    stats: { type: Schema.Types.Mixed, default: {} },

    // Capped list of specific transcript moments (conversationId, userId,
    // turnIndex, judge, evidence, anonymized excerpts). Kept as Mixed — the
    // shape belongs to the miner, and the report is read-only.
    findings: { type: [Schema.Types.Mixed], default: [] },

    // Budget-capped LLM-judge tier summary + per-turn verdicts.
    llmTier: { type: Schema.Types.Mixed, default: {} },

    // scenarios.json-shaped stubs — each a copy-pasteable candidate eval case.
    scenarioStubs: { type: [Schema.Types.Mixed], default: [] },

    durationMs: { type: Number, default: null },
    error: { type: String, default: null },
}, { timestamps: true });

tutorQualityReportSchema.index({ runAt: -1 });
// Reports age out after 90 days — the durable artifacts are the eval scenarios
// humans promote out of them, not the runs themselves.
tutorQualityReportSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

const TutorQualityReport = mongoose.models.TutorQualityReport
    || mongoose.model('TutorQualityReport', tutorQualityReportSchema);

module.exports = TutorQualityReport;
