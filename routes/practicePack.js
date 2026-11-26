/**
 * PRINTABLE PRACTICE PACKS
 *
 * Generates personalized PDF worksheets based on a student's current
 * skill level, active misconceptions, and IRT theta. Students (or
 * parents/teachers) print the worksheet, complete it on paper, then
 * photograph and upload via Show Your Work for AI feedback.
 *
 * GET  /api/practice-pack/generate  — returns a PDF download
 * GET  /api/practice-pack/preview   — returns JSON with problem data (for UI preview)
 *
 * @module routes/practicePack
 */

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const Problem = require('../models/problem');
const Skill = require('../models/skill');
const TutorPlan = require('../models/tutorPlan');
const logger = require('../utils/logger').child({ route: 'practicePack' });
const { skillLookupCandidates } = require('../utils/skillCanonicalizer');
const { atLevelIdsFor } = require('../utils/courseCheckSources');
const { normalizedMasteryScore } = require('../utils/masteryScore');

const { anyRole, userHasRole } = require('../utils/roleQuery');
const { normalizeOptions } = require('../utils/mcOptions');
const { buildSheetHTML } = require('../utils/practiceSheet');
// Puppeteer for HTML → PDF rendering
let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  logger.warn('[PracticePack] Puppeteer not available — PDF generation disabled');
}

// QR code generation
let QRCode;
try {
  QRCode = require('qrcode');
} catch (e) {
  logger.warn('[PracticePack] qrcode package not available — QR codes disabled');
}

// Owner call (2026-07-26): a worksheet should be "a more substantial sheet,
// 15-20 practice problems" — 8 read as thin. Default sits inside the owner's
// range; the cap is its top end. Owner call (2026-11-26): two columns with a
// line, TWO PAGES TOPS — the sheet enforces that when it is laid out
// (utils/practiceSheet.js), giving up work space first and problems last.
const MAX_PROBLEMS = 20;
const DEFAULT_PROBLEM_COUNT = 16;
const DEFAULT_TITLE = 'Practice Pack';

// Launch options for headless PDF rendering. Uses chrome-headless-shell
// (bundled by Puppeteer via .puppeteerrc.cjs) instead of the system chromium
// package — the latter ships a broken crashpad handler in our deploy
// environment that fails with "chrome_crashpad_handler: --database is required".
const BROWSER_LAUNCH_OPTIONS = {
  headless: 'shell',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
  ],
};

// Puppeteer v23+ returns page.pdf() as a Uint8Array, NOT a Buffer. Express 4's
// res.send() only treats Buffers as binary — a plain Uint8Array falls through
// to res.json(), which serializes the PDF bytes as {"0":37,"1":80,...}. The
// download then arrives as a .pdf full of JSON that no reader can open (the
// Content-Type header survives, so nothing errors anywhere). Every pdf
// response MUST go through this.
function toPdfBuffer(bytes) {
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
}

// ============================================================================
// PROBLEM SELECTION — Adaptive, personalized to student
// ============================================================================

/**
 * Select problems for a practice pack based on student profile.
 *
 * Strategy:
 *   1. Get skills the student is currently learning or has gaps in
 *   2. Select problems near their difficulty level
 *   3. Mix in 1-2 prerequisite review problems for confidence
 *   4. Avoid recently seen problems
 */
/**
 * Get the student's best-available theta. Canonical source is user.currentTheta
 * (set by the IRT screener / growth checks). Falls back to a stale path some
 * legacy code wrote to, then to 0.
 */
// Delegates to the shared resolver (utils/theta.js). The old local version
// checked user.currentTheta FIRST — a field with schema default 0 that no
// writer ever set, so every pack was difficulty-anchored at θ=0.
const { resolveTheta } = require('../utils/theta');
// Grade-level seam (utils/gradeLevel.js): band on the ASSESSED level when one
// exists — user.gradeLevel is the SIGNUP grade, which the screener never
// updates, so a 9th grader placed at 5th-grade math got 8-12-band worksheets.
const { resolveGradeLevel } = require('../utils/gradeLevel');

/**
 * Map a string grade level ("7th Grade", "Algebra 1", "K", "College") to the
 * Problem.gradeBand enum. Used when a student has no theta yet.
 */
function gradeLevelToBand(gradeLevel) {
  if (!gradeLevel) return null;
  const g = String(gradeLevel).toLowerCase();

  // Course names first — "Calculus 3" contains a digit but isn't grade 3.
  if (/calc(ulus)?\s*(3|iii)|multivariable/.test(g)) return 'Calc 3';
  if (/pre-?calc/.test(g)) return '8-12'; // pre-calc is a high-school course
  if (/calc(ulus)?/.test(g)) return 'Calculus';
  if (/(algebra|geometry|trig|stat)/.test(g)) return '8-12';

  if (/(^k\b|kinder|prek|pre-k)/.test(g)) return 'K-5';
  const yearMatch = g.match(/(\d+)/);
  if (yearMatch) {
    const n = parseInt(yearMatch[1], 10);
    if (n <= 5) return 'K-5';
    if (n <= 8) return '5-8';
    return '8-12';
  }
  return null;
}

/**
 * Skills for the student's CURRENT course module, if they're in one.
 * Any failure (no session, missing pathway file, malformed module) returns []
 * so pack generation falls back to the frontier selector — never throws.
 */
async function activeCourseModuleSkills(user) {
  try {
    if (!user?.activeCourseSessionId) return [];
    const fs = require('fs');
    const path = require('path');
    const CourseSession = require('../models/courseSession');
    const cs = await CourseSession.findById(user.activeCourseSessionId).lean();
    if (!cs || cs.status !== 'active' || !cs.currentModuleId) return [];
    const pathwayFile = path.join(__dirname, '../public/resources', `${cs.courseId}-pathway.json`);
    if (!fs.existsSync(pathwayFile)) return [];
    const pathway = JSON.parse(fs.readFileSync(pathwayFile, 'utf8'));
    const mod = (pathway.modules || []).find((m) => m.moduleId === cs.currentModuleId);
    if (!mod) return [];
    let skills = mod.skills || [];
    if (mod.moduleFile) {
      const mf = path.join(__dirname, '../public', mod.moduleFile);
      if (fs.existsSync(mf)) {
        const md = JSON.parse(fs.readFileSync(mf, 'utf8'));
        if (Array.isArray(md.skills) && md.skills.length) skills = md.skills;
      }
    }
    return skills.map((s) => (typeof s === 'string' ? s : s?.skillId)).filter(Boolean);
  } catch (e) {
    logger.warn('[PracticePack] course module skill lookup failed', { error: e.message });
    return [];
  }
}

/**
 * Human filename for a generated pack (owner ask, 2026-07-28: "need a naming
 * convention for the Practice Packs"). Shape:
 *   MATHMATIX-Practice_<Topic>_<FirstName>_<YYYY-MM-DD>.pdf
 * Topic is the pack's (first) skill display name, "Mixed-Review" for a
 * frontier grab-bag. Sanitized to filename-safe ASCII.
 */
async function packFileName(firstName, problems) {
  const clean = (s) => String(s).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'Practice';
  const date = new Date().toISOString().slice(0, 10);
  const ids = [...new Set((problems || []).map((p) => p.skillId).filter(Boolean))];
  let topic = 'Mixed-Review';
  if (ids.length >= 1) {
    let name = ids[0];
    try {
      const doc = await Skill.findOne({ skillId: ids[0] }).select('displayName').lean();
      if (doc?.displayName) name = doc.displayName;
    } catch (_) { /* fall back to the raw id */ }
    topic = ids.length === 1 ? name : `${name}-and-more`;
  }
  return `MATHMATIX-Practice_${clean(topic)}_${clean(firstName || 'Student')}_${date}.pdf`;
}

/**
 * The ONE skill the tutor is actively working on for this student, per the
 * tutor plan's currentTarget. Read-only on purpose: printing a worksheet must
 * never mint a plan as a side effect, so this does NOT use loadOrCreatePlan.
 * Returns null when there's no plan or no target.
 */
async function currentTutorPlanTarget(user) {
  try {
    const plan = await TutorPlan.findOne({ userId: user._id })
      .select('currentTarget.skillId')
      .lean();
    return plan?.currentTarget?.skillId || null;
  } catch (e) {
    logger.warn('[PracticePack] tutor plan target lookup failed', { error: e.message });
    return null;
  }
}

async function selectProblemsForPack(user, options = {}) {
  const { count = DEFAULT_PROBLEM_COUNT, skillId = null } = options;
  const problems = [];
  const excludeIds = [];

  // Get student's theta and skill mastery
  const theta = resolveTheta(user);
  const targetDifficulty = Problem.thetaToDifficulty(theta);

  // Determine which skills to pull from
  let targetSkills = [];

  if (skillId) {
    // Specific skill requested
    targetSkills = [skillId];
  } else {
    // A student in an active course gets a pack that matches TODAY'S module —
    // not their historical skillMastery frontier. Production failure: an AP
    // Calc student mid-lesson on rational functions was handed shaded-circle
    // fractions and place-value drills, because stale elementary mastery
    // records were the only thing this selector ever looked at.
    const courseSkills = await activeCourseModuleSkills(user);
    if (courseSkills.length > 0) {
      targetSkills = courseSkills.slice(0, 4);
    }

    // Not in a course (or the module resolved nothing): fall back to what the
    // tutor is ACTUALLY working on this session before dropping to the
    // historical skillMastery scan below. Without this, a free-chat student
    // whose client sends no skillId gets a pack built from stale mastery
    // records instead of the skill they were just struggling with.
    if (targetSkills.length === 0) {
      const planTarget = await currentTutorPlanTarget(user);
      if (planTarget) targetSkills = [planTarget];
    }
  }

  if (targetSkills.length === 0) {
    // Auto-select from student's learning frontier
    const skillMastery = user.skillMastery || new Map();
    const learningSkills = [];
    const reviewSkills = [];

    for (const [sid, data] of skillMastery) {
      if (data.status === 'learning' || data.status === 'introduced') {
        learningSkills.push(sid);
      } else if (data.status === 'mastered' && normalizedMasteryScore(data.masteryScore) < 90) {
        reviewSkills.push(sid); // Not fully solid — good for review
      }
    }

    // Prioritize learning skills, fill with review
    targetSkills = [...learningSkills.slice(0, 4), ...reviewSkills.slice(0, 2)];

    // Fallback: if no skill data, use general problems at their level.
    // Use the student's stated grade level when theta is the default (0) —
    // a brand-new K-2 student should not get 5-8 grade-band problems.
    if (targetSkills.length === 0) {
      const usingDefaultTheta = theta === 0 && typeof user?.currentTheta !== 'number';
      const gradeBand = (usingDefaultTheta && gradeLevelToBand(resolveGradeLevel(user))) || thetaToGradeBand(theta);
      const fallback = await selectFallbackProblems({ count, gradeBand, targetDifficulty });
      return fallback;
    }
  }

  // Pull problems from target skills
  const problemsPerSkill = Math.ceil(count / Math.max(targetSkills.length, 1));

  for (const sid of targetSkills) {
    if (problems.length >= count) break;

    const remaining = count - problems.length;
    const needed = Math.min(problemsPerSkill, remaining);

    // The problem bank is keyed by bank/legacy skill ids while skillMastery
    // (where targetSkills come from) uses canonical unified ids — query under
    // every id the bank might use, or the skill-targeted select silently
    // matches nothing and the whole pack falls back to generic grade-band
    // problems (owner-hit: an Absolute Value student got a fractions pack).
    let sidCandidates = skillLookupCandidates(sid);
    // A skill some course has its own at-level items for is practised from
    // those when the bank holds them — the crosswalk's pool for such a skill
    // does not test it (utils/courseCheckSources.js).
    const atLevel = atLevelIdsFor(sid);
    if (atLevel.length && await Problem.exists({ skillId: { $in: atLevel }, isActive: true, problemId: { $nin: excludeIds } })) {
      sidCandidates = atLevel;
    }

    // Try difficulty-banded first, then any difficulty for the skill — better
    // to give problems slightly off-level than to return an empty pack.
    let skillProblems = await Problem.find({
      skillId: { $in: sidCandidates },
      isActive: true,
      problemId: { $nin: excludeIds },
      difficulty: {
        $gte: Math.max(1, targetDifficulty - 1),
        $lte: Math.min(5, targetDifficulty + 1)
      }
    }).limit(needed * 3);

    if (skillProblems.length === 0) {
      skillProblems = await Problem.find({
        skillId: { $in: sidCandidates },
        isActive: true,
        problemId: { $nin: excludeIds }
      }).limit(needed * 3);
    }

    const shuffled = skillProblems.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, needed);

    for (const p of selected) {
      problems.push(p);
      excludeIds.push(p.problemId);
    }
  }

  // If skill-based selection still returned nothing usable, fall back to
  // grade-band general problems so the user always gets *some* worksheet.
  if (problems.length === 0) {
    const gradeBand = gradeLevelToBand(resolveGradeLevel(user)) || thetaToGradeBand(theta);
    return await selectFallbackProblems({ count, gradeBand, targetDifficulty });
  }

  return problems;
}

/**
 * Last-resort problem selection. Tries progressively looser filters so we
 * never return an empty pack when problems exist somewhere in the DB.
 *   1. gradeBand + narrow difficulty
 *   2. gradeBand only (any difficulty)
 *   3. any active problem
 */
async function selectFallbackProblems({ count, gradeBand, targetDifficulty }) {
  const queries = [];
  if (gradeBand) {
    queries.push({
      isActive: true,
      gradeBand,
      difficulty: {
        $gte: Math.max(1, targetDifficulty - 1),
        $lte: Math.min(5, targetDifficulty + 1)
      }
    });
    queries.push({ isActive: true, gradeBand });
  }
  queries.push({ isActive: true });

  for (const filter of queries) {
    const docs = await Problem.find(filter).limit(count * 4);
    if (docs.length > 0) {
      const shuffled = docs.sort(() => Math.random() - 0.5);
      return shuffled.slice(0, count);
    }
  }
  return [];
}

/**
 * Map theta to approximate grade band for fallback problem selection.
 */
function thetaToGradeBand(theta) {
  if (theta < -2) return 'K-5';
  if (theta < -0.5) return 'K-5';
  if (theta < 1) return '5-8';
  if (theta < 2) return '8-12';
  return 'Calculus';
}

// ============================================================================
// HTML TEMPLATE — Generates clean, printable worksheet HTML
// ============================================================================

/**
 * Generate a QR code data URI. Falls back to a text URL if qrcode is unavailable.
 */
async function generateQRDataURI(url) {
  if (!QRCode) return null;
  try {
    return await QRCode.toDataURL(url, {
      width: 100,
      margin: 1,
      color: { dark: '#1a1a2e', light: '#ffffff' }
    });
  } catch (e) {
    logger.warn('[PracticePack] QR generation failed', { error: e.message });
    return null;
  }
}

/**
 * Build the worksheet page. The page itself — the owner's format: two columns
 * with a line between them, at most two pages — is utils/practiceSheet.js;
 * this gathers what goes on it.
 *
 * options.blankName: a class pack is printed for many students, so its NAME
 * and DATE lines are left to write on.
 */
async function generateWorksheetHTML(user, problems, options = {}) {
  const { title, showAnswerKey = false, packId, blankName = false } = options;
  const studentName = blankName ? '' : `${user.firstName || ''} ${user.lastName || ''}`.trim();
  const date = blankName ? '' : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const worksheetTitle = title || DEFAULT_TITLE;

  // Generate QR code that links to the upload flow
  const uploadUrl = `https://mathmatix.ai/chat${packId ? '?pack=' + packId : ''}`;
  const qrDataURI = await generateQRDataURI(uploadUrl);

  // Group problems by skill for organization
  const skillGroups = {};
  const skillNames = {};
  for (const p of problems) {
    const key = p.skillId || 'general';
    if (!skillGroups[key]) skillGroups[key] = [];
    skillGroups[key].push(p);
  }

  // Look up display names for skills used in this pack
  const skillIds = Object.keys(skillGroups).filter(k => k !== 'general');
  if (skillIds.length > 0) {
    const skills = await Skill.find({ skillId: { $in: skillIds } }).select('skillId displayName').lean();
    for (const s of skills) {
      skillNames[s.skillId] = s.displayName;
    }
  }
  // Fallback: title-case the skillId for any that weren't found
  for (const sid of skillIds) {
    if (!skillNames[sid]) {
      skillNames[sid] = sid.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  const groups = Object.entries(skillGroups).map(([skillId, probs]) => ({
    label: skillNames[skillId] || '',
    problems: probs.map(p => ({
      prompt: p.prompt,
      svg: p.svg || '',
      // Labels come from normalizeOptions, which assigns them by position for
      // every stored shape — a shuffled bank's own letters print out of order
      // (C, A, B, D). { label, text } only: never the bank's isCorrect.
      options: p.answerType === 'multiple-choice' ? normalizeOptions(p.options) : [],
      answer: p.answer?.value ?? p.answer ?? '—',
    })),
  }));

  // A one-skill pack with no title of its own is headed by the skill, the way
  // a Paper Practice sheet is headed by its lesson.
  const oneSkill = groups.length === 1 && groups[0].label;
  const heading = worksheetTitle === DEFAULT_TITLE && oneSkill ? groups[0].label : worksheetTitle;

  return buildSheetHTML({ title: worksheetTitle, heading, studentName, date, groups, showAnswerKey, qrDataURI });
}

/**
 * Print a worksheet page to PDF. The page lays itself out (two columns, at
 * most two pages) after its math is typeset and reports on window.__sheet;
 * printing before that would print the unpaginated fallback.
 */
async function renderWorksheetPdf(html) {
  const browser = await puppeteer.launch(BROWSER_LAUNCH_OPTIONS);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    try {
      await page.waitForFunction('window.__sheet', { timeout: 15000 });
      const sheet = await page.evaluate('window.__sheet');
      if (sheet.error) logger.warn('[PracticePack] sheet layout failed — printing unpaginated', { error: sheet.error });
      else if (sheet.dropped) logger.info(`[PracticePack] ${sheet.dropped} problem(s) left off to keep the sheet to ${sheet.pages} pages`);
    } catch (e) {
      logger.warn('[PracticePack] sheet layout did not finish — printing unpaginated', { error: e.message });
    }
    // The page sets its own size and margins (@page), one .sheet per page.
    return toPdfBuffer(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  } finally {
    try { await browser.close(); } catch (_) { /* ignore */ }
  }
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * Preview the practice pack (JSON with problem data, for UI display)
 * GET /api/practice-pack/preview
 */
router.get('/preview', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const count = Math.min(parseInt(req.query.count) || DEFAULT_PROBLEM_COUNT, MAX_PROBLEMS);
    const skillId = req.query.skillId || null;

    const problems = await selectProblemsForPack(user, { count, skillId });

    if (problems.length === 0) {
      return res.json({
        success: false,
        message: 'No problems available for your current level. Try completing the screener first!'
      });
    }

    res.json({
      success: true,
      problemCount: problems.length,
      problems: problems.map(p => ({
        problemId: p.problemId,
        prompt: p.prompt,
        skillId: p.skillId,
        difficulty: p.difficulty,
        answerType: p.answerType,
        // { label, text } only — the legacy banks carry `isCorrect` on every
        // option, which would ship the answer key with the worksheet.
        options: normalizeOptions(p.options),
        svg: p.svg || null,
      }))
    });
  } catch (error) {
    logger.error('[PracticePack] Preview error:', error);
    res.status(500).json({ error: 'Failed to generate practice pack preview' });
  }
});

/**
 * Generate a printable PDF practice pack
 * GET /api/practice-pack/generate
 */
router.get('/generate', isAuthenticated, async (req, res) => {
  if (!puppeteer) {
    return res.status(503).json({ error: 'PDF generation is not available on this server' });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const count = Math.min(parseInt(req.query.count) || DEFAULT_PROBLEM_COUNT, MAX_PROBLEMS);
    const skillId = req.query.skillId || null;
    const title = req.query.title || 'Practice Pack';
    const showAnswerKey = req.query.answerKey === 'true';

    const problems = await selectProblemsForPack(user, { count, skillId });

    if (problems.length === 0) {
      return res.status(404).json({
        error: 'No problems available for your current level. Try completing the screener first!'
      });
    }

    // Generate HTML (now async for QR code generation)
    const html = await generateWorksheetHTML(user, problems, { title, showAnswerKey });

    const pdfBuffer = await renderWorksheetPdf(html);

    // Set response headers for PDF download
    const fileName = await packFileName(user.firstName, problems);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    logger.info(`[PracticePack] Generated ${problems.length}-problem PDF for ${user.firstName}`);

  } catch (error) {
    logger.error('[PracticePack] PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate practice pack PDF' });
  }
});

/**
 * Teacher endpoint: Generate differentiated practice packs for a class
 * POST /api/practice-pack/class-generate
 */
router.post('/class-generate', isAuthenticated, async (req, res) => {
  try {
    const teacher = await User.findById(req.user._id);
    if (!teacher || !userHasRole(teacher, 'teacher')) {
      return res.status(403).json({ error: 'Teacher access required' });
    }

    const { skillId, title } = req.body;
    if (!skillId) {
      return res.status(400).json({ error: 'skillId is required' });
    }

    // Get all students for this teacher
    const students = await User.find({ teacherId: teacher._id, ...anyRole('student') })
      .select('firstName lastName currentTheta gradeLevel learningProfile skillMastery');

    if (students.length === 0) {
      return res.status(404).json({ error: 'No students found for your class' });
    }

    // Group students into 3 difficulty tiers based on theta
    const tiers = { below: [], onLevel: [], above: [] };
    for (const s of students) {
      const theta = resolveTheta(s);
      if (theta < -0.5) tiers.below.push(s);
      else if (theta > 0.5) tiers.above.push(s);
      else tiers.onLevel.push(s);
    }

    // Generate problem sets for each tier
    const tierProblems = {};
    for (const [tierName, tierStudents] of Object.entries(tiers)) {
      if (tierStudents.length === 0) continue;
      // Use the median student's profile for problem selection
      const medianStudent = tierStudents[Math.floor(tierStudents.length / 2)];
      tierProblems[tierName] = await selectProblemsForPack(medianStudent, {
        count: DEFAULT_PROBLEM_COUNT,
        skillId
      });
    }

    res.json({
      success: true,
      skillId,
      tiers: {
        below: { studentCount: tiers.below.length, problemCount: tierProblems.below?.length || 0 },
        onLevel: { studentCount: tiers.onLevel.length, problemCount: tierProblems.onLevel?.length || 0 },
        above: { studentCount: tiers.above.length, problemCount: tierProblems.above?.length || 0 },
      },
      message: `Generated ${Object.keys(tierProblems).length} differentiated tiers for ${students.length} students`
    });

  } catch (error) {
    logger.error('[PracticePack] Class generation error:', error);
    res.status(500).json({ error: 'Failed to generate class practice packs' });
  }
});

/**
 * Get available skills for the skill selector dropdown.
 * Returns skills the student is currently working on, plus popular skills for their level.
 * GET /api/practice-pack/skills
 */
router.get('/skills', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const skillMastery = user.skillMastery || new Map();
    const studentSkills = [];

    for (const [sid, data] of skillMastery) {
      if (data.status === 'learning' || data.status === 'introduced' || data.status === 'mastered') {
        studentSkills.push({
          skillId: sid,
          displayName: data.displayName || sid.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          status: data.status,
          masteryScore: normalizedMasteryScore(data.masteryScore)
        });
      }
    }

    // Sort: learning first, then by mastery score ascending (weakest first)
    studentSkills.sort((a, b) => {
      const order = { learning: 0, introduced: 1, mastered: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return a.masteryScore - b.masteryScore;
    });

    res.json({ success: true, skills: studentSkills.slice(0, 20) });
  } catch (error) {
    logger.error('[PracticePack] Skills list error:', error);
    res.status(500).json({ error: 'Failed to load skills' });
  }
});

/**
 * Parent endpoint: Generate a practice pack PDF for a linked child.
 * GET /api/practice-pack/generate-for-child?childId=...&count=...&skillId=...&answerKey=true
 */
router.get('/generate-for-child', isAuthenticated, async (req, res) => {
  if (!puppeteer) {
    return res.status(503).json({ error: 'PDF generation is not available on this server' });
  }

  try {
    const parent = await User.findById(req.user._id);
    if (!parent || !userHasRole(parent, 'parent')) {
      return res.status(403).json({ error: 'Parent access required' });
    }

    const { childId } = req.query;
    if (!childId) return res.status(400).json({ error: 'childId is required' });

    // Verify parent-child link (parentIds is an array)
    const child = await User.findById(childId);
    const isLinked = child && (child.parentIds || []).some(pid => String(pid) === String(parent._id));
    if (!isLinked) {
      return res.status(403).json({ error: 'You can only generate packs for your linked children' });
    }

    const count = Math.min(parseInt(req.query.count) || DEFAULT_PROBLEM_COUNT, MAX_PROBLEMS);
    const skillId = req.query.skillId || null;
    const showAnswerKey = req.query.answerKey === 'true';
    const title = req.query.title || 'Practice Pack';

    const problems = await selectProblemsForPack(child, { count, skillId });

    if (problems.length === 0) {
      return res.status(404).json({
        error: 'No problems available for this student\'s level yet.'
      });
    }

    const html = await generateWorksheetHTML(child, problems, { title, showAnswerKey });

    const pdfBuffer = await renderWorksheetPdf(html);

    const fileName = await packFileName(child.firstName, problems);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    logger.info(`[PracticePack] Parent ${parent.firstName} generated pack for child ${child.firstName}`);

  } catch (error) {
    logger.error('[PracticePack] Parent generation error:', error);
    res.status(500).json({ error: 'Failed to generate practice pack' });
  }
});

/**
 * Teacher endpoint: Generate a PDF practice pack with answer key for a class.
 * GET /api/practice-pack/class-generate-pdf?skillId=...&tier=below|onLevel|above&answerKey=true
 */
router.get('/class-generate-pdf', isAuthenticated, async (req, res) => {
  if (!puppeteer) {
    return res.status(503).json({ error: 'PDF generation is not available on this server' });
  }

  try {
    const teacher = await User.findById(req.user._id);
    if (!teacher || !userHasRole(teacher, 'teacher')) {
      return res.status(403).json({ error: 'Teacher access required' });
    }

    const { skillId, tier = 'onLevel' } = req.query;
    if (!skillId) return res.status(400).json({ error: 'skillId is required' });

    const showAnswerKey = req.query.answerKey === 'true';
    const count = Math.min(parseInt(req.query.count) || DEFAULT_PROBLEM_COUNT, MAX_PROBLEMS);

    // Get students for this teacher in the specified tier
    const students = await User.find({ teacherId: teacher._id, ...anyRole('student') })
      .select('firstName lastName currentTheta gradeLevel learningProfile skillMastery');

    const tierRanges = { below: [-Infinity, -0.5], onLevel: [-0.5, 0.5], above: [0.5, Infinity] };
    const [lo, hi] = tierRanges[tier] || tierRanges.onLevel;
    const tierStudents = students.filter(s => {
      const t = resolveTheta(s);
      return t >= lo && t < hi;
    });

    // Use median student for problem selection
    const representative = tierStudents.length > 0
      ? tierStudents[Math.floor(tierStudents.length / 2)]
      : teacher; // fallback

    const problems = await selectProblemsForPack(representative, { count, skillId });

    if (problems.length === 0) {
      return res.status(404).json({ error: 'No problems available for this skill and tier.' });
    }

    // Look up skill display name (id-tolerant: see skillLookupCandidates)
    const skill = await Skill.findOne({ skillId: { $in: skillLookupCandidates(skillId) } });
    const skillLabel = skill?.displayName || skillId.replace(/-/g, ' ');
    const tierLabel = { below: 'Approaching', onLevel: 'On Level', above: 'Advanced' }[tier] || tier;
    const title = `${skillLabel} — ${tierLabel}`;

    const html = await generateWorksheetHTML(representative, problems, { title, showAnswerKey, blankName: true });

    const pdfBuffer = await renderWorksheetPdf(html);

    const fileName = `class-pack-${skillId}-${tier}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    logger.info(`[PracticePack] Teacher ${teacher.firstName} generated class pack: ${skillId} (${tier})`);

  } catch (error) {
    logger.error('[PracticePack] Class PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate class practice pack' });
  }
});

// Expose pure helpers on the router so they're reachable from unit tests
// without a fragile separate util module. Express routers are plain
// functions, so attaching named properties is safe.
router.__helpers = {
  resolveTheta,
  gradeLevelToBand,
  thetaToGradeBand,
  toPdfBuffer,
  packFileName,
  activeCourseModuleSkills,
  generateWorksheetHTML
};

module.exports = router;
