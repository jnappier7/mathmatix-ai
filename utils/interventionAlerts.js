/**
 * Teacher Intervention Alert Service
 *
 * Monitors student learning metrics and generates intervention alerts
 * when risk thresholds are crossed. Alerts are stored on the User model
 * and optionally emailed to the teacher.
 *
 * Risk scoring mirrors routes/analytics.js risk-radar:
 *   riskScore = (1 - avgPLearned) * 0.3
 *            + min(cognitiveLoad, 1) * 0.3
 *            + (1 - avgSmartScore/100) * 0.2
 *            + (1 - avgRetrievability) * 0.2
 *
 * @module utils/interventionAlerts
 */

const { calculateRetrievability } = require('./fsrsScheduler');
const _logger = require('./logger').child({ module: 'interventionAlerts' });

// Thresholds for alert tiers
const THRESHOLDS = {
    TIER_1: 0.55,  // Watch — something may be off
    TIER_2: 0.65,  // Concern — teacher should check in
    TIER_3: 0.80,  // Urgent — immediate intervention recommended
};

// Minimum time between alerts for the same student (24 hours)
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Compute a student's risk score from their learning engine data.
 * Same formula as the risk-radar analytics endpoint.
 *
 * @param {Object} user - User document (lean or hydrated)
 * @returns {{ riskScore: number, factors: Object, atRisk: boolean }}
 */
function computeRiskScore(user) {
    const engines = user.learningEngines || {};

    // Avg pLearned (BKT)
    const bkt = engines.bkt;
    const bktEntries = bkt ? (typeof bkt.entries === 'function' ? Array.from(bkt.entries()) : Object.entries(bkt)) : [];
    let avgPLearned = 0;
    if (bktEntries.length > 0) {
        avgPLearned = bktEntries.reduce((sum, [, d]) => sum + (d.pLearned ?? 0), 0) / bktEntries.length;
    }

    // Avg retrievability (FSRS)
    const fsrs = engines.fsrs;
    const fsrsEntries = fsrs ? (typeof fsrs.entries === 'function' ? Array.from(fsrs.entries()) : Object.entries(fsrs)) : [];
    let avgRetrievability = 1;
    if (fsrsEntries.length > 0) {
        avgRetrievability = fsrsEntries.reduce((sum, [, d]) => {
            const elapsed = d.lastReview ? (Date.now() - new Date(d.lastReview).getTime()) / 86400000 : 0;
            return sum + calculateRetrievability(elapsed, d.stability ?? 0);
        }, 0) / fsrsEntries.length;
    }

    // Recent cognitive load
    const cogHistory = engines.cognitiveLoadHistory || [];
    const recentCognitiveLoad = cogHistory.length > 0
        ? cogHistory[cogHistory.length - 1].avgLoad ?? 0
        : 0;

    // Avg SmartScore (consistency)
    const consistency = engines.consistency;
    const consistencyEntries = consistency
        ? (typeof consistency.entries === 'function' ? Array.from(consistency.entries()) : Object.entries(consistency))
        : [];
    let avgSmartScore = 100;
    if (consistencyEntries.length > 0) {
        avgSmartScore = consistencyEntries.reduce((sum, [, d]) => sum + (d.smartScore ?? 0), 0) / consistencyEntries.length;
    }

    const riskScore =
        (1 - avgPLearned) * 0.3 +
        Math.min(recentCognitiveLoad, 1) * 0.3 +
        (1 - avgSmartScore / 100) * 0.2 +
        (1 - avgRetrievability) * 0.2;

    return {
        riskScore: Math.round(riskScore * 1000) / 1000,
        factors: {
            avgPLearned: Math.round(avgPLearned * 1000) / 1000,
            avgRetrievability: Math.round(avgRetrievability * 1000) / 1000,
            recentCognitiveLoad: Math.round(recentCognitiveLoad * 1000) / 1000,
            avgSmartScore: Math.round(avgSmartScore * 100) / 100,
        },
        atRisk: avgPLearned < 0.4 || recentCognitiveLoad > 0.7 || avgSmartScore < 40,
    };
}

/**
 * Determine the intervention tier based on risk score.
 * @param {number} riskScore
 * @returns {{ tier: number, label: string, urgency: string }}
 */
function getInterventionTier(riskScore) {
    if (riskScore >= THRESHOLDS.TIER_3) {
        return { tier: 3, label: 'Urgent', urgency: 'high' };
    } else if (riskScore >= THRESHOLDS.TIER_2) {
        return { tier: 2, label: 'Concern', urgency: 'medium' };
    } else if (riskScore >= THRESHOLDS.TIER_1) {
        return { tier: 1, label: 'Watch', urgency: 'low' };
    }
    return { tier: 0, label: 'On Track', urgency: 'none' };
}

/**
 * Generate a plain-language recommendation based on risk factors.
 * @param {Object} factors - From computeRiskScore
 * @param {Object} tierInfo - From getInterventionTier
 * @returns {string}
 */
function generateRecommendation(factors, tierInfo) {
    const issues = [];

    if (factors.avgPLearned < 0.4) {
        issues.push('struggling to grasp core concepts (low mastery)');
    } else if (factors.avgPLearned < 0.6) {
        issues.push('making slow progress on skill mastery');
    }

    if (factors.recentCognitiveLoad > 0.7) {
        issues.push('showing signs of cognitive overload');
    }

    if (factors.avgSmartScore < 40) {
        issues.push('inconsistent performance across skills');
    } else if (factors.avgSmartScore < 60) {
        issues.push('some inconsistency in skill retention');
    }

    if (factors.avgRetrievability < 0.5) {
        issues.push('previously learned skills are fading from memory');
    }

    if (issues.length === 0) return 'Continue monitoring.';

    const actions = {
        1: 'Consider a brief check-in during the next class.',
        2: 'A one-on-one conversation or targeted practice session is recommended.',
        3: 'Immediate intervention recommended — consider reducing difficulty, providing scaffolding, or scheduling a support meeting.',
    };

    return `This student is ${issues.join(', ')}. ${actions[tierInfo.tier] || ''}`;
}

/**
 * Check whether a student should trigger an intervention alert,
 * and if so, build the alert object. Does NOT persist or send —
 * the caller decides what to do with it.
 *
 * @param {Object} user - User document
 * @returns {Object|null} Alert object or null if no alert needed
 */
function checkForInterventionAlert(user) {
    // Need at least some learning engine data to assess
    const engines = user.learningEngines || {};
    const hasBkt = engines.bkt && (typeof engines.bkt.size === 'number' ? engines.bkt.size > 0 : Object.keys(engines.bkt).length > 0);
    if (!hasBkt) return null;

    const { riskScore, factors, atRisk } = computeRiskScore(user);
    const tierInfo = getInterventionTier(riskScore);

    // No alert for Tier 0
    if (tierInfo.tier === 0) return null;

    // Check cooldown — don't re-alert within 24 hours
    const lastAlert = user.lastInterventionAlert;
    if (lastAlert) {
        const lastTime = lastAlert.timestamp ? new Date(lastAlert.timestamp).getTime() : 0;
        const lastTier = lastAlert.tier || 0;

        // Same or lower tier within cooldown? Skip.
        if (tierInfo.tier <= lastTier && Date.now() - lastTime < ALERT_COOLDOWN_MS) {
            return null;
        }
        // Higher tier but within 1 hour? Skip (don't spam escalations)
        if (tierInfo.tier > lastTier && Date.now() - lastTime < 60 * 60 * 1000) {
            return null;
        }
    }

    const recommendation = generateRecommendation(factors, tierInfo);

    return {
        studentId: user._id,
        studentName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        timestamp: new Date(),
        tier: tierInfo.tier,
        label: tierInfo.label,
        urgency: tierInfo.urgency,
        riskScore,
        factors,
        atRisk,
        recommendation,
    };
}

module.exports = {
    computeRiskScore,
    getInterventionTier,
    generateRecommendation,
    checkForInterventionAlert,
    THRESHOLDS,
};
