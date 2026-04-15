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

// QR code generation
let QRCode;
try {
  QRCode = require('qrcode');
} catch (e) {
  logger.warn('[PracticePack] qrcode package not available — QR codes disabled');
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
    logger.warn('[PracticePack] QR generation failed:', e.message);
    return null;
  }
}

/**
 * Render difficulty as filled/empty dots (1-5 scale).
 */
function difficultyDots(level) {
  const clamped = Math.max(1, Math.min(5, Math.round(level || 1)));
  let html = '<span class="difficulty-dots" title="Difficulty ' + clamped + '/5">';
  for (let i = 1; i <= 5; i++) {
    html += i <= clamped
      ? '<span class="dot filled"></span>'
      : '<span class="dot empty"></span>';
  }
  html += '</span>';
  return html;
}

/**
 * Build the full worksheet HTML with grid-paper work areas, QR code,
 * difficulty indicators, KaTeX auto-render, and optional answer key.
 */
async function generateWorksheetHTML(user, problems, options = {}) {
  const { title, showAnswerKey = false, packId } = options;
  const studentName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Student';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const worksheetTitle = title || 'Practice Pack';

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
    if (p.skillId && !skillNames[key]) {
      skillNames[key] = p.skillName || p.skillId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  // Build problems HTML
  let problemsHTML = '';
  let answerKeyHTML = '';
  let problemNum = 1;

  for (const [skillId, probs] of Object.entries(skillGroups)) {
    // Skill section header
    const skillLabel = skillNames[skillId] || '';
    if (Object.keys(skillGroups).length > 1 && skillLabel) {
      problemsHTML += `<div class="skill-section-header">${skillLabel}</div>`;
    }

    for (const p of probs) {
      const hasSVG = p.svg ? `<div class="problem-svg">${p.svg}</div>` : '';
      const hasOptions = (p.answerType === 'multiple-choice' && p.options?.length > 0)
        ? `<div class="problem-options">${p.options.map(o =>
            `<span class="option-item"><span class="option-letter">${o.label}</span> ${o.text}</span>`
          ).join('')}</div>`
        : '';

      const dots = difficultyDots(p.difficulty);

      problemsHTML += `
        <div class="problem">
          <div class="problem-sidebar">
            <div class="problem-number">${problemNum}</div>
            ${dots}
          </div>
          <div class="problem-content">
            <div class="problem-prompt">${p.prompt}</div>
            ${hasSVG}
            ${hasOptions}
            <div class="work-area">
              <div class="grid-paper">
                <div class="grid-bg"></div>
              </div>
              <div class="answer-line">
                <span class="answer-label">Answer:</span>
                <span class="answer-blank"></span>
              </div>
            </div>
          </div>
        </div>
      `;

      // Build answer key entry
      const answerValue = p.answer?.value ?? p.answer ?? '—';
      answerKeyHTML += `
        <div class="answer-key-item">
          <span class="ak-num">${problemNum}.</span>
          <span class="ak-answer">${answerValue}</span>
        </div>
      `;

      problemNum++;
    }
  }

  // QR section for footer
  const qrHTML = qrDataURI
    ? `<div class="footer-qr">
        <img src="${qrDataURI}" alt="QR code to upload work" class="qr-code" />
        <div class="qr-label">Scan to upload<br/>your work</div>
      </div>`
    : `<div class="footer-qr"><div class="qr-label">Upload at mathmatix.ai</div></div>`;

  // Answer key page (printed on a separate page)
  const answerKeyPage = showAnswerKey ? `
    <div class="page-break"></div>
    <div class="answer-key-page">
      <div class="ak-header">
        <h2>Answer Key — ${worksheetTitle}</h2>
        <div class="ak-meta">${studentName} &bull; ${date} &bull; ${problems.length} problems</div>
      </div>
      <div class="ak-grid">${answerKeyHTML}</div>
      <div class="ak-note">Answers shown are primary accepted values. Equivalent forms are also accepted during AI grading.</div>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${worksheetTitle} — ${studentName}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js"
    onload="renderMathInElement(document.body, {delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\\\(',right:'\\\\)',display:false},{left:'\\\\[',right:'\\\\]',display:true}]});"></script>
  <style>
    @page { size: letter; margin: 0.6in 0.7in; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 13.5px;
      color: #1a1a2e;
      line-height: 1.5;
    }

    /* ---- Header ---- */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #1a1a2e;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .header-left h1 { font-size: 22px; margin-bottom: 2px; letter-spacing: -0.3px; }
    .header-left .subtitle { font-size: 11px; color: #888; }
    .header-right { text-align: right; font-size: 11.5px; color: #555; line-height: 1.6; }

    /* ---- Student Info ---- */
    .student-info {
      display: flex;
      gap: 24px;
      margin-bottom: 18px;
      font-size: 13px;
    }
    .student-info .field { border-bottom: 1px solid #999; min-width: 140px; padding-bottom: 2px; }
    .student-info .field-label { font-weight: 600; margin-right: 4px; }

    /* ---- Skill Section Headers ---- */
    .skill-section-header {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #4a6cf7;
      border-bottom: 1px solid #e0e0f0;
      padding-bottom: 3px;
      margin: 18px 0 10px;
    }

    /* ---- Problems ---- */
    .problem {
      display: flex;
      gap: 12px;
      margin-bottom: 6px;
      page-break-inside: avoid;
    }
    .problem-sidebar {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 36px;
      padding-top: 2px;
    }
    .problem-number {
      font-weight: 800;
      font-size: 16px;
      color: #1a1a2e;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 2px solid #1a1a2e;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 4px;
    }

    /* Difficulty dots */
    .difficulty-dots { display: flex; gap: 2px; }
    .difficulty-dots .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
    }
    .difficulty-dots .dot.filled { background: #1a1a2e; }
    .difficulty-dots .dot.empty { background: #d0d0d0; }

    .problem-content { flex: 1; }
    .problem-prompt { font-size: 14px; margin-bottom: 6px; line-height: 1.55; }
    .problem-svg { margin: 6px 0; text-align: center; }
    .problem-svg svg { max-width: 280px; max-height: 180px; }
    .problem-options { display: flex; flex-wrap: wrap; gap: 10px 18px; margin: 6px 0 8px; }
    .option-item { font-size: 13px; display: flex; align-items: baseline; gap: 4px; }
    .option-letter {
      font-weight: 700;
      background: #f0f0f0;
      border-radius: 3px;
      padding: 0 5px;
      font-size: 12px;
    }

    /* ---- Grid Paper Work Area ---- */
    .work-area { margin-top: 6px; margin-bottom: 10px; }
    .grid-paper {
      width: 100%;
      height: 110px;
      border: 1px solid #ccc;
      border-radius: 4px;
      position: relative;
      overflow: hidden;
      margin-bottom: 8px;
    }
    .grid-bg {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(180,200,230,0.25) 1px, transparent 1px),
        linear-gradient(90deg, rgba(180,200,230,0.25) 1px, transparent 1px);
      background-size: 18px 18px;
    }
    .answer-line {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .answer-label { font-weight: 700; font-size: 13px; }
    .answer-blank {
      border-bottom: 2.5px solid #1a1a2e;
      flex: 1;
      max-width: 220px;
      height: 22px;
    }

    /* ---- Footer ---- */
    .footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 2px solid #1a1a2e;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #666;
    }
    .footer-instructions { max-width: 60%; line-height: 1.5; }
    .footer-instructions strong { color: #1a1a2e; }
    .footer-qr { display: flex; align-items: center; gap: 8px; }
    .qr-code { width: 72px; height: 72px; }
    .qr-label { font-size: 10px; color: #888; text-align: center; line-height: 1.4; }

    /* ---- Answer Key Page ---- */
    .page-break { page-break-before: always; }
    .answer-key-page { padding-top: 10px; }
    .ak-header { border-bottom: 2px solid #1a1a2e; padding-bottom: 8px; margin-bottom: 16px; }
    .ak-header h2 { font-size: 18px; }
    .ak-meta { font-size: 12px; color: #666; margin-top: 2px; }
    .ak-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px 16px;
    }
    .answer-key-item {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 6px 8px;
      border: 1px solid #e8e8e8;
      border-radius: 4px;
      background: #fafafa;
    }
    .ak-num { font-weight: 700; color: #333; min-width: 24px; }
    .ak-answer { font-family: 'Courier New', monospace; font-size: 13px; color: #2e7d32; font-weight: 600; }
    .ak-note { margin-top: 20px; font-size: 11px; color: #999; font-style: italic; }

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
      <strong>Done?</strong> Take a photo of your work and upload it at <strong>mathmatix.ai</strong>
      (or scan the QR code). Your AI tutor will check each step and give personalized feedback!
    </div>
    ${qrHTML}
  </div>

  ${answerKeyPage}
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
    const showAnswerKey = req.query.answerKey === 'true';

    const problems = await selectProblemsForPack(user, { count, skillId });

    if (problems.length === 0) {
      return res.status(404).json({
        error: 'No problems available for your current level. Try completing the screener first!'
      });
    }

    // Generate HTML (now async for QR code generation)
    const html = await generateWorksheetHTML(user, problems, { title, showAnswerKey });

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
          masteryScore: data.masteryScore || 0
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

  let browser;
  try {
    const parent = await User.findById(req.user._id);
    if (!parent || parent.role !== 'parent') {
      return res.status(403).json({ error: 'Parent access required' });
    }

    const { childId } = req.query;
    if (!childId) return res.status(400).json({ error: 'childId is required' });

    // Verify parent-child link
    const child = await User.findById(childId);
    if (!child || String(child.parentId) !== String(parent._id)) {
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

    const fileName = `practice-pack-${child.firstName || 'student'}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    logger.info(`[PracticePack] Parent ${parent.firstName} generated pack for child ${child.firstName}`);

  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch (_) { /* ignore */ }
    }
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

  let browser;
  try {
    const teacher = await User.findById(req.user._id);
    if (!teacher || teacher.role !== 'teacher') {
      return res.status(403).json({ error: 'Teacher access required' });
    }

    const { skillId, tier = 'onLevel' } = req.query;
    if (!skillId) return res.status(400).json({ error: 'skillId is required' });

    const showAnswerKey = req.query.answerKey === 'true';
    const count = Math.min(parseInt(req.query.count) || DEFAULT_PROBLEM_COUNT, MAX_PROBLEMS);

    // Get students for this teacher in the specified tier
    const students = await User.find({ teacherId: teacher._id, role: 'student' })
      .select('firstName lastName learningProfile.abilityEstimate.theta skillMastery');

    const tierRanges = { below: [-Infinity, -0.5], onLevel: [-0.5, 0.5], above: [0.5, Infinity] };
    const [lo, hi] = tierRanges[tier] || tierRanges.onLevel;
    const tierStudents = students.filter(s => {
      const t = s.learningProfile?.abilityEstimate?.theta || 0;
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

    // Look up skill display name
    const skill = await Skill.findOne({ skillId });
    const skillLabel = skill?.displayName || skillId.replace(/-/g, ' ');
    const tierLabel = { below: 'Approaching', onLevel: 'On Level', above: 'Advanced' }[tier] || tier;
    const title = `${skillLabel} — ${tierLabel}`;

    const html = await generateWorksheetHTML(representative, problems, { title, showAnswerKey });

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

    const fileName = `class-pack-${skillId}-${tier}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    logger.info(`[PracticePack] Teacher ${teacher.firstName} generated class pack: ${skillId} (${tier})`);

  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch (_) { /* ignore */ }
    }
    logger.error('[PracticePack] Class PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate class practice pack' });
  }
});

module.exports = router;
