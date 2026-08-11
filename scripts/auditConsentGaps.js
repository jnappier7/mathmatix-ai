// scripts/auditConsentGaps.js
//
// Consent-state census for the CONSENT_ENFORCEMENT rollout: who would the
// own-consent gate block, and how big is each population? Read-only by
// default; run it in the Render Web Shell (needs MONGO_URI).
//
// Buckets every student account with the SAME decision function the live
// gate uses (middleware/consentGate.js evaluateOwnConsent), on .lean() docs —
// i.e. the true stored state, including accounts that predate the
// privacyConsent subdoc entirely.
//
// --backfill-legacy migrates accounts whose only consent evidence is the
// legacy hasParentalConsent=true flag to a proper privacyConsent record.
//
// HONESTY POLICY. The backfill writes consentType 'legacy_migration' with
// grantedByRole 'system' and verificationMethod 'admin_override' — it records
// that a legacy grant existed, not that we know how it was verified, because
// the old write path kept no record. Pathway is inferred: school_dpa when the
// account carries a schoolLicenseId, individual_parent otherwise.
//
// Usage:
//   node scripts/auditConsentGaps.js                          # census only, writes nothing
//   node scripts/auditConsentGaps.js --backfill-legacy        # DRY RUN of the backfill
//   node scripts/auditConsentGaps.js --backfill-legacy --apply
//   node scripts/auditConsentGaps.js --limit 500              # sample a subset

const APPLY = process.argv.includes('--apply');
const BACKFILL = process.argv.includes('--backfill-legacy');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 0;

const { evaluateOwnConsent } = require('../middleware/consentGate');
const { computeAge, COPPA_AGE } = require('../utils/consentManager');

function ageBucket(dateOfBirth) {
    const age = computeAge(dateOfBirth);
    if (age === null) return 'nullDOB';
    if (age < COPPA_AGE) return '<13';
    if (age < 18) return '13-17';
    return '18+';
}

async function main() {
    require('dotenv').config();
    const mongoose = require('mongoose');
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
    await mongoose.connect(process.env.MONGO_URI);
    const User = require('../models/user');

    const projection =
        'role roles dateOfBirth hasParentalConsent schoolLicenseId ' +
        'privacyConsent.status privacyConsent.consentPathway privacyConsent.history';

    // The gate only ever evaluates accounts holding no adult role, but audit
    // everything so the census shows the whole picture.
    let query = User.find({}, projection).lean();
    if (LIMIT > 0) query = query.limit(LIMIT);

    const counts = new Map();   // "bucket|age" -> n
    let total = 0;
    let wouldBlock = 0;
    const legacyIds = [];

    for await (const user of query.cursor()) {
        total++;
        const decision = evaluateOwnConsent(user);
        const age = ageBucket(user.dateOfBirth);
        const key = `${decision.bucket}|${age}`;
        counts.set(key, (counts.get(key) || 0) + 1);
        if (!decision.allow) wouldBlock++;
        if (decision.bucket === 'legacy') legacyIds.push(user._id);
    }

    const rows = [...counts.entries()]
        .sort()
        .map(([key, n]) => {
            const [bucket, age] = key.split('|');
            return { bucket, age, count: n };
        });
    console.table(rows);
    console.log(`Total accounts scanned: ${total}${LIMIT ? ` (sampled with --limit ${LIMIT})` : ''}`);
    console.log(`Would be BLOCKED under CONSENT_ENFORCEMENT=enforce: ${wouldBlock}`);
    console.log(`Legacy-flag-only accounts (backfill candidates): ${legacyIds.length}`);

    if (BACKFILL && legacyIds.length > 0) {
        console.log(`\n--backfill-legacy: ${APPLY ? 'APPLYING' : 'DRY RUN (add --apply to write)'}`);
        let migrated = 0;
        for (const id of legacyIds) {
            const student = await User.findById(id);
            if (!student) continue;
            // Re-check on the hydrated doc: only migrate when the stored state
            // is still legacy-shaped (no history, not active).
            const history = student.privacyConsent && student.privacyConsent.history;
            const status = student.privacyConsent && student.privacyConsent.status;
            const stillLegacy =
                student.hasParentalConsent === true &&
                (!history || history.length === 0) &&
                status !== 'active';
            if (!stillLegacy) continue;

            const pathway = student.schoolLicenseId ? 'school_dpa' : 'individual_parent';
            if (APPLY) {
                if (!student.privacyConsent) student.privacyConsent = {};
                if (!student.privacyConsent.history) student.privacyConsent.history = [];
                student.privacyConsent.status = 'active';
                student.privacyConsent.consentPathway = pathway;
                student.privacyConsent.activeConsentDate = new Date();
                student.privacyConsent.history.push({
                    consentType: 'legacy_migration',
                    grantedByRole: 'system',
                    grantedAt: new Date(),
                    scope: [
                        'data_collection', 'ai_processing', 'progress_tracking',
                        'teacher_visibility', 'parent_visibility', 'iep_data_processing',
                    ],
                    verificationMethod: 'admin_override',
                });
                await student.save();
            }
            migrated++;
        }
        console.log(`${APPLY ? 'Migrated' : 'Would migrate'}: ${migrated}`);
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
