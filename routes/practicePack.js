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
const logger = require('../utils/logger').child({ route: 'practicePack' });

// Puppeteer for HTML → PDF rendering
let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  logger.warn('[PracticePack] Puppeteer not available — PDF generation disabled');
}

const MAX_PROBLEMS = 15;
const DEFAULT_PROBLEM_COUNT = 8;

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
async function selectProblemsForPack(user, options = {}) {
  const { count = DEFAULT_PROBLEM_COUNT, skillId = null } = options;
  const problems = [];
  const excludeIds = [];

  // Get student's theta and skill mastery
  const theta = user.learningProfile?.abilityEstimate?.theta || 0;
  const targetDifficulty = Problem.thetaToDifficulty(theta);

  // Determine which skills to pull from
  let targetSkills = [];

  if (skillId) {
    // Specific skill requested
    targetSkills = [skillId];
  } else {
    // Auto-select from student's learning frontier
    const skillMastery = user.skillMastery || new Map();
    const learningSkills = [];
    const reviewSkills = [];

    for (const [sid, data] of skillMastery) {
      if (data.status === 'learning' || data.status === 'introduced') {
        learningSkills.push(sid);
      } else if (data.status === 'mastered' && data.masteryScore < 90) {
        reviewSkills.push(sid); // Not fully solid — good for review
      }
    }

    // Prioritize learning skills, fill with review
    targetSkills = [...learningSkills.slice(0, 4), ...reviewSkills.slice(0, 2)];

    // Fallback: if no skill data, use general problems at their level
    if (targetSkills.length === 0) {
      const gradeBand = thetaToGradeBand(theta);
      const generalProblems = await Problem.find({
        isActive: true,
        gradeBand,
        difficulty: {
          $gte: Math.max(1, targetDifficulty - 1),
          $lte: Math.min(5, targetDifficulty + 1)
        }
      }).limit(count * 2);

      // Shuffle and take what we need
      const shuffled = generalProblems.sort(() => Math.random() - 0.5);
      return shuffled.slice(0, count);
    }
  }

  // Pull problems from target skills
  const problemsPerSkill = Math.ceil(count / Math.max(targetSkills.length, 1));

  for (const sid of targetSkills) {
    if (problems.length >= count) break;

    const remaining = count - problems.length;
    const needed = Math.min(problemsPerSkill, remaining);

    const skillProblems = await Problem.find({
      skillId: sid,
      isActive: true,
      problemId: { $nin: excludeIds },
      difficulty: {
        $gte: Math.max(1, targetDifficulty - 1),
        $lte: Math.min(5, targetDifficulty + 1)
      }
    }).limit(needed * 3); // Over-fetch for shuffling

    const shuffled = skillProblems.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, needed);

    for (const p of selected) {
      problems.push(p);
      excludeIds.push(p.problemId);
    }
  }

  return problems;
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

function generateWorksheetHTML(user, problems, options = {}) {
  const { title, showAnswerKey = false } = options;
  const studentName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Student';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const worksheetTitle = title || 'Practice Pack';

  // Group problems by skill for nice organization
  const skillGroups = {};
  for (const p of problems) {
    const key = p.skillId || 'general';
    if (!skillGroups[key]) skillGroups[key] = [];
    skillGroups[key].push(p);
  }

  let problemsHTML = '';
  let problemNum = 1;

  for (const [skillId, probs] of Object.entries(skillGroups)) {
    for (const p of probs) {
      const hasSVG = p.svg ? `<div class="problem-svg">${p.svg}</div>` : '';
      const hasOptions = (p.answerType === 'multiple-choice' && p.options?.length > 0)
        ? `<div class="problem-options">${p.options.map(o =>
            `<span class="option-item">${o.label}. ${o.text}</span>`
          ).join('')}</div>`
        : '';

      problemsHTML += `
        <div class="problem">
          <div class="problem-number">${problemNum}.</div>
          <div class="problem-content">
            <div class="problem-prompt">${p.prompt}</div>
            ${hasSVG}
            ${hasOptions}
            <div class="answer-space">
              <div class="work-area-label">Show your work:</div>
              <div class="work-lines">
                <div class="work-line"></div>
                <div class="work-line"></div>
                <div class="work-line"></div>
                <div class="work-line"></div>
              </div>
              <div class="answer-line">
                <span class="answer-label">Answer:</span>
                <span class="answer-blank"></span>
              </div>
            </div>
          </div>
        </div>
      `;
      problemNum++;
    }
  }

  // QR code placeholder (scan to get help from AI tutor)
  const qrNote = `Scan to get help: mathmatix.ai/chat`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${worksheetTitle} — ${studentName}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
  <style>
    @page {
      size: letter;
      margin: 0.75in;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 14px;
      color: #1a1a2e;
      line-height: 1.5;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #333;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .header-left h1 {
      font-size: 20px;
      margin-bottom: 4px;
    }
    .header-left .subtitle {
      font-size: 12px;
      color: #666;
    }
    .header-right {
      text-align: right;
      font-size: 12px;
      color: #555;
    }
    .student-info {
      display: flex;
      gap: 24px;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .student-info .field {
      border-bottom: 1px solid #999;
      min-width: 150px;
      padding-bottom: 2px;
    }
    .student-info .field-label {
      font-weight: 600;
      margin-right: 4px;
    }

    .problem {
      display: flex;
      gap: 10px;
      margin-bottom: 24px;
      page-break-inside: avoid;
    }
    .problem-number {
      font-weight: 700;
      font-size: 15px;
      min-width: 28px;
      color: #333;
    }
    .problem-content {
      flex: 1;
    }
    .problem-prompt {
      font-size: 14px;
      margin-bottom: 8px;
    }
    .problem-svg {
      margin: 8px 0;
      text-align: center;
    }
    .problem-svg svg {
      max-width: 300px;
      max-height: 200px;
    }
    .problem-options {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin: 8px 0;
    }
    .option-item {
      font-size: 13px;
      min-width: 120px;
    }

    .answer-space {
      margin-top: 8px;
    }
    .work-area-label {
      font-size: 11px;
      color: #888;
      margin-bottom: 4px;
    }
    .work-lines {
      margin-bottom: 8px;
    }
    .work-line {
      border-bottom: 1px solid #ddd;
      height: 24px;
    }
    .answer-line {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
    }
    .answer-label {
      font-weight: 600;
      font-size: 13px;
    }
    .answer-blank {
      border-bottom: 2px solid #333;
      flex: 1;
      max-width: 200px;
      height: 20px;
    }

    .footer {
      margin-top: 30px;
      padding-top: 12px;
      border-top: 1px solid #ccc;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #888;
    }
    .footer-instructions {
      max-width: 70%;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>${worksheetTitle}</h1>
      <div class="subtitle">Personalized practice from M&Delta;THM&Delta;TI&Chi; AI</div>
    </div>
    <div class="header-right">
      <div>${date}</div>
      <div>${problems.length} problems</div>
    </div>
  </div>

  <div class="student-info">
    <div><span class="field-label">Name:</span> <span class="field">${studentName}</span></div>
    <div><span class="field-label">Date:</span> <span class="field">${date}</span></div>
    <div><span class="field-label">Period:</span> <span class="field">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></div>
  </div>

  <div class="problems">
    ${problemsHTML}
  </div>

  <div class="footer">
    <div class="footer-instructions">
      When you're done, take a photo of your work and upload it at <strong>mathmatix.ai</strong> using the
      camera button. Your AI tutor will review your work and give you personalized feedback!
    </div>
    <div>${qrNote}</div>
  </div>
</body>
</html>`;
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
        options: p.options || [],
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

  let browser;
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const count = Math.min(parseInt(req.query.count) || DEFAULT_PROBLEM_COUNT, MAX_PROBLEMS);
    const skillId = req.query.skillId || null;
    const title = req.query.title || 'Practice Pack';

    const problems = await selectProblemsForPack(user, { count, skillId });

    if (problems.length === 0) {
      return res.status(404).json({
        error: 'No problems available for your current level. Try completing the screener first!'
      });
    }

    // Generate HTML
    const html = generateWorksheetHTML(user, problems, { title });

    // Render to PDF via Puppeteer
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      margin: { top: '0.5in', bottom: '0.5in', left: '0.75in', right: '0.75in' },
      printBackground: true,
    });

    await browser.close();
    browser = null;

    // Set response headers for PDF download
    const fileName = `practice-pack-${user.firstName || 'student'}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    logger.info(`[PracticePack] Generated ${problems.length}-problem PDF for ${user.firstName}`);

  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch (_) { /* ignore */ }
    }
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
    if (!teacher || teacher.role !== 'teacher') {
      return res.status(403).json({ error: 'Teacher access required' });
    }

    const { skillId, title } = req.body;
    if (!skillId) {
      return res.status(400).json({ error: 'skillId is required' });
    }

    // Get all students for this teacher
    const students = await User.find({ teacherId: teacher._id, role: 'student' })
      .select('firstName lastName learningProfile.abilityEstimate.theta skillMastery');

    if (students.length === 0) {
      return res.status(404).json({ error: 'No students found for your class' });
    }

    // Group students into 3 difficulty tiers based on theta
    const tiers = { below: [], onLevel: [], above: [] };
    for (const s of students) {
      const theta = s.learningProfile?.abilityEstimate?.theta || 0;
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

module.exports = router;
