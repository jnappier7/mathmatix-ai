'use strict';
/* ============================================================
   parentReport.js — the parent Learning Report, built once.

   Lifted out of routes/parent.js so the dashboard modal, the printable report
   and the emailed digest all show the same numbers and the same sentences
   (the digest kept its own copy of this logic and drifted). Sentences are
   rendered in the parent's language (utils/parentReportText.js); each insight
   also carries its key + params so another renderer can re-render it.
   ============================================================ */

const mongoose = require('mongoose');
const Conversation = require('../models/conversation');
const CourseSession = require('../models/courseSession');
const { skillPictureFor } = require('./parentSkillPicture');
const { buildChildProfile, readStreak } = require('./parentChildProfile');
const { renderMessage, listOf, normalizeLanguage } = require('./parentReportText');

/**
 * @param {Object} child  lean user doc (already access-checked by the caller)
 * @param {Object} [opts]
 * @param {string} [opts.language]  the PARENT's language (parentLanguage)
 * @param {Date}   [opts.now]
 */
async function buildLearningReport(child, { language, now = new Date() } = {}) {
    const lang = normalizeLanguage(language);
    const childId = child._id;
    const childObjectId = new mongoose.Types.ObjectId(childId);
    const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

    // ------------------------------------------------------------------
    // 1. SESSION DATA — this week and previous week for trend comparison
    // ------------------------------------------------------------------
    const [thisWeekStats, prevWeekStats] = await Promise.all([
        Conversation.aggregate([
            { $match: { userId: childObjectId, lastActivity: { $gte: oneWeekAgo } } },
            { $group: {
                _id: null,
                totalProblems: { $sum: { $ifNull: ['$problemsAttempted', 0] } },
                totalCorrect: { $sum: { $ifNull: ['$problemsCorrect', 0] } },
                totalMinutes: { $sum: { $ifNull: ['$activeMinutes', 0] } },
                sessionCount: { $sum: 1 }
            }}
        ]),
        Conversation.aggregate([
            { $match: { userId: childObjectId, lastActivity: { $gte: twoWeeksAgo, $lt: oneWeekAgo } } },
            { $group: {
                _id: null,
                totalProblems: { $sum: { $ifNull: ['$problemsAttempted', 0] } },
                totalCorrect: { $sum: { $ifNull: ['$problemsCorrect', 0] } },
                totalMinutes: { $sum: { $ifNull: ['$activeMinutes', 0] } },
                sessionCount: { $sum: 1 }
            }}
        ])
    ]);

    const thisWeek = thisWeekStats[0] || { totalProblems: 0, totalCorrect: 0, totalMinutes: 0, sessionCount: 0 };
    const prevWeek = prevWeekStats[0] || { totalProblems: 0, totalCorrect: 0, totalMinutes: 0, sessionCount: 0 };

    const thisWeekAccuracy = thisWeek.totalProblems > 0
        ? Math.round((thisWeek.totalCorrect / thisWeek.totalProblems) * 100)
        : null;
    const prevWeekAccuracy = prevWeek.totalProblems > 0
        ? Math.round((prevWeek.totalCorrect / prevWeek.totalProblems) * 100)
        : null;

    // ------------------------------------------------------------------
    // 2-4. SKILLS, MEMORY, CATEGORIES — one classification (utils/parentSkillPicture)
    // shared with the dashboard card and the analytics endpoints, so the report
    // can't contradict the card it opens from. Placed-out skills are counted
    // apart from mastered ones; strengths are earned + recent.
    // ------------------------------------------------------------------
    const engines = child.learningEngines || {};
    const [picture, reportCourses] = await Promise.all([
        skillPictureFor(child, now.getTime()),
        CourseSession.find({ userId: childId, status: { $in: ['active', 'paused'] } }).select('courseId courseName').lean(),
    ]);
    const reportCourseNames = reportCourses.filter(c => !/^parent-/.test(c.courseId || '')).map(c => c.courseName);
    const fadingSkills = picture.memory.skills.filter(m => m.status === 'fading');
    const reviewSkills = picture.growthAreas;
    const masteredThisWeek = picture.masteredThisWeek;

    // ------------------------------------------------------------------
    // 5. COGNITIVE LOAD — Recent trend
    // ------------------------------------------------------------------
    const cogHistory = engines.cognitiveLoadHistory || [];
    const recentCogHistory = cogHistory.filter(h => h.date && new Date(h.date) >= oneWeekAgo);
    let cognitiveLoadTrend = 'no-data';
    let avgCognitiveLoad = null;

    if (recentCogHistory.length > 0) {
        avgCognitiveLoad = recentCogHistory.reduce((sum, h) => sum + (h.avgLoad ?? 0), 0) / recentCogHistory.length;
        avgCognitiveLoad = Math.round(avgCognitiveLoad * 1000) / 1000;

        if (recentCogHistory.length >= 2) {
            const mid = Math.floor(recentCogHistory.length / 2);
            const firstHalfAvg = recentCogHistory.slice(0, mid).reduce((s, h) => s + (h.avgLoad ?? 0), 0) / mid;
            const secondHalfAvg = recentCogHistory.slice(mid).reduce((s, h) => s + (h.avgLoad ?? 0), 0) / (recentCogHistory.length - mid);
            if (secondHalfAvg > firstHalfAvg + 0.05) cognitiveLoadTrend = 'rising';
            else if (secondHalfAvg < firstHalfAvg - 0.05) cognitiveLoadTrend = 'improving';
            else cognitiveLoadTrend = 'stable';
        } else {
            cognitiveLoadTrend = 'stable';
        }
    }

    // ------------------------------------------------------------------
    // 6. BADGES & MILESTONES — Recent achievements
    // ------------------------------------------------------------------
    const recentBadges = [];
    if (child.badges && Array.isArray(child.badges)) {
        for (const badge of child.badges) {
            if (badge.unlockedAt && new Date(badge.unlockedAt) >= oneWeekAgo) {
                recentBadges.push({ key: badge.key, badgeId: badge.badgeId, unlockedAt: badge.unlockedAt });
            }
        }
    }
    // Strategy badges (Master Mode)
    const recentStrategyBadges = [];
    if (child.strategyBadges && Array.isArray(child.strategyBadges)) {
        for (const badge of child.strategyBadges) {
            if (badge.earnedDate && new Date(badge.earnedDate) >= oneWeekAgo) {
                recentStrategyBadges.push({ badgeId: badge.badgeId, badgeName: badge.badgeName, category: badge.category, earnedDate: badge.earnedDate });
            }
        }
    }

    // ------------------------------------------------------------------
    // 7. GROWTH TRAJECTORY — Theta over time
    // ------------------------------------------------------------------
    const growthHistory = child.learningProfile?.growthCheckHistory || [];
    const currentTheta = child.learningProfile?.currentTheta || 0;
    let thetaGrowthThisMonth = null;

    if (growthHistory.length >= 2) {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
        const recentChecks = growthHistory.filter(g => g.date && new Date(g.date) >= thirtyDaysAgo);
        if (recentChecks.length > 0) {
            thetaGrowthThisMonth = recentChecks.reduce((sum, g) => sum + (g.thetaChange || 0), 0);
            thetaGrowthThisMonth = Math.round(thetaGrowthThisMonth * 100) / 100;
        }
    }

    // ------------------------------------------------------------------
    // 8. STREAKS & ENGAGEMENT
    // ------------------------------------------------------------------
    // The User schema has no top-level `streak` — this read was always 0.
    const streak = readStreak(child, now);
    const dailyQuests = child.dailyQuests || {};
    const weeklyChallenges = child.weeklyChallenges || {};

    // ------------------------------------------------------------------
    // 9. FACT FLUENCY SUMMARY
    // ------------------------------------------------------------------
    const fluencyStats = child.factFluencyProgress?.stats || {};
    const fluencyFamilies = child.factFluencyProgress?.factFamilies || {};
    let fluencyMastered = 0;
    let fluencyTotal = 0;
    for (const [, familyData] of Object.entries(fluencyFamilies)) {
        fluencyTotal++;
        if (familyData.mastered) fluencyMastered++;
    }

    // ------------------------------------------------------------------
    // 10. GENERATE PLAIN-LANGUAGE INSIGHTS
    // ------------------------------------------------------------------
    const insights = [];
    const name = child.firstName;
    // Each insight keeps its key + params so another renderer (email, print)
    // can re-render it; `message` is the parent's language.
    const say = (type, tone, key, params = {}) => insights.push({
        type, tone, key, params, message: renderMessage(key, { name, ...params }, lang),
    });
    // Accuracy needs a real sample: under MIN_FOR_ACCURACY checked problems a
    // percentage reads as a verdict ("100%" for 1 of 1) — count instead.
    const MIN_FOR_ACCURACY = 5;

    // Activity
    if (thisWeek.sessionCount === 0) {
        say('engagement', 'concern', 'insight.activity.none');
    } else if (thisWeek.sessionCount >= 5) {
        say('engagement', 'positive', 'insight.activity.high', { sessions: thisWeek.sessionCount, minutes: thisWeek.totalMinutes });
    } else {
        say('engagement', 'neutral', 'insight.activity.some', { sessions: thisWeek.sessionCount, minutes: thisWeek.totalMinutes, count: thisWeek.sessionCount });
    }

    // Accuracy
    const thisWeekJudged = thisWeekAccuracy !== null && thisWeek.totalProblems >= MIN_FOR_ACCURACY;
    const prevWeekJudged = prevWeekAccuracy !== null && prevWeek.totalProblems >= MIN_FOR_ACCURACY;
    if (thisWeekJudged && prevWeekJudged && thisWeekAccuracy - prevWeekAccuracy > 5) {
        say('accuracy', 'positive', 'insight.accuracy.up', { prev: prevWeekAccuracy, now: thisWeekAccuracy });
    } else if (thisWeekJudged && prevWeekJudged && thisWeekAccuracy - prevWeekAccuracy < -10) {
        say('accuracy', 'concern', 'insight.accuracy.down', { prev: prevWeekAccuracy, now: thisWeekAccuracy });
    } else if (thisWeekJudged) {
        say('accuracy', 'neutral', 'insight.accuracy.flat', { now: thisWeekAccuracy, problems: thisWeek.totalProblems });
    } else if (thisWeek.totalProblems > 0) {
        say('accuracy', 'neutral', 'insight.accuracy.small', { correct: thisWeek.totalCorrect, problems: thisWeek.totalProblems });
    }

    // Memory — fading (50-85% recall) and due-for-review are different asks.
    if (fadingSkills.length > 0) {
        const names = fadingSkills.slice(0, 3).map(s => s.name);
        say('memory', 'actionable', 'insight.memory.fading', { skills: listOf(names, lang), count: names.length });
    } else if (picture.memory.strong > 0) {
        say('memory', 'positive', 'insight.memory.strong', { count: picture.memory.strong });
    }

    // Cognitive load
    if (cognitiveLoadTrend === 'rising') {
        say('cognitive', 'concern', 'insight.cognitive.rising');
    } else if (cognitiveLoadTrend === 'improving') {
        say('cognitive', 'positive', 'insight.cognitive.improving');
    }

    // Mastery milestone — earned, never placement.
    if (masteredThisWeek > 0) {
        say('milestone', 'positive', 'insight.milestone', { count: masteredThisWeek });
    }

    // Review
    if (reviewSkills.length > 0) {
        const names = reviewSkills.slice(0, 3).map(s => s.name);
        say('growth', 'actionable', 'insight.review', { skills: listOf(names, lang), count: names.length });
    }

    // ------------------------------------------------------------------
    // 11. OVERALL HEADLINE
    // ------------------------------------------------------------------
    const hasActivity = thisWeek.sessionCount > 0;
    const hasMasteryGrowth = masteredThisWeek > 0 || (thetaGrowthThisMonth !== null && thetaGrowthThisMonth > 0);
    const hasStrongAccuracy = thisWeekJudged && thisWeekAccuracy >= 70;
    const hasHighCogLoad = cognitiveLoadTrend === 'rising';

    const headlineTone = !hasActivity ? 'needs-attention'
        : hasMasteryGrowth && hasStrongAccuracy ? 'excellent'
            : hasStrongAccuracy ? 'good'
                : hasHighCogLoad ? 'growing'
                    : 'building';
    const HEADLINE_KEY = {
        'needs-attention': 'headline.none', excellent: 'headline.excellent', good: 'headline.good',
        growing: 'headline.growing', building: 'headline.building',
    };
    const headline = renderMessage(HEADLINE_KEY[headlineTone], { name }, lang);

    // ------------------------------------------------------------------
    // BUILD RESPONSE
    // ------------------------------------------------------------------
    return {
        success: true,
        reportDate: now.toISOString(),
        period: { from: oneWeekAgo.toISOString(), to: now.toISOString() },
        child: {
            id: child._id,
            firstName: child.firstName,
            lastName: child.lastName,
            gradeLevel: child.gradeLevel,
            mathCourse: child.mathCourse,
            profile: buildChildProfile(child, reportCourseNames),
            level: child.level || 1,
            xp: child.xp || 0
        },

        headline: { text: headline, tone: headlineTone },
        language: lang,

        insights,

        weeklySnapshot: {
            thisWeek: {
                sessions: thisWeek.sessionCount,
                minutes: thisWeek.totalMinutes,
                problemsAttempted: thisWeek.totalProblems,
                problemsCorrect: thisWeek.totalCorrect,
                accuracy: thisWeekAccuracy
            },
            previousWeek: {
                sessions: prevWeek.sessionCount,
                minutes: prevWeek.totalMinutes,
                problemsAttempted: prevWeek.totalProblems,
                problemsCorrect: prevWeek.totalCorrect,
                accuracy: prevWeekAccuracy
            },
            trends: {
                sessionsDelta: thisWeek.sessionCount - prevWeek.sessionCount,
                minutesDelta: thisWeek.totalMinutes - prevWeek.totalMinutes,
                accuracyDelta: (thisWeekAccuracy !== null && prevWeekAccuracy !== null) ? thisWeekAccuracy - prevWeekAccuracy : null,
                problemsDelta: thisWeek.totalProblems - prevWeek.totalProblems
            }
        },

        mastery: {
            counts: picture.counts,
            topStrengths: picture.topStrengths.map(t => ({ skillId: t.key, displayName: t.name, category: t.category, score: t.score })),
            growthAreas: reviewSkills.map(g => ({ skillId: g.key, displayName: g.name, category: g.category, reason: g.reason })),
            categories: picture.categories
        },

        memoryHealth: {
            strong: picture.memory.strong,
            fading: picture.memory.fading,
            needsReview: picture.memory.needsReview,
            totalTracked: picture.memory.tracked,
            // Only skills with review data have a memory reading — say so.
            scope: 'practiced-with-review-data',
            skills: picture.memory.skills.slice(0, 5).map(m => ({ skillId: m.key, displayName: m.name, retrievability: m.retrievability, status: m.status }))
        },

        cognitiveLoad: {
            average: avgCognitiveLoad,
            trend: cognitiveLoadTrend,
            label: cognitiveLoadTrend === 'improving' ? 'Getting easier'
                : cognitiveLoadTrend === 'rising' ? 'Working harder'
                : cognitiveLoadTrend === 'stable' ? 'Steady effort'
                : 'Not enough data yet'
        },

        growth: {
            currentTheta,
            thetaGrowthThisMonth,
            recentChecks: growthHistory.slice(-5).map(g => ({
                date: g.date,
                thetaChange: g.thetaChange,
                growthStatus: g.growthStatus,
                accuracy: g.accuracy
            }))
        },

        milestones: {
            badges: recentBadges,
            strategyBadges: recentStrategyBadges,
            skillsMasteredThisWeek: masteredThisWeek
        },

        engagement: {
            currentStreak: streak.current,
            longestStreak: streak.longest,
            totalTutoringMinutes: child.totalActiveTutoringMinutes || 0,
            questsCompleted: dailyQuests.quests ? dailyQuests.quests.filter(q => q.completed).length : 0,
            challengesCompleted: weeklyChallenges.challenges ? weeklyChallenges.challenges.filter(c => c.completed).length : 0
        },

        factFluency: {
            mastered: fluencyMastered,
            total: fluencyTotal,
            totalSessions: fluencyStats.totalSessions || 0,
            overallAccuracy: fluencyStats.overallAccuracy ? Math.round(fluencyStats.overallAccuracy) : null
        }
    };
}

module.exports = { buildLearningReport };
