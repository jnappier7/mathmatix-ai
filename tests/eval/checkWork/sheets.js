/**
 * Loading the check-work eval's sheets: the hand-labeled corpus (corpus.json)
 * and any REAL sheets dropped into ./sheets/<id>/ (see sheets/README.md).
 * Also renders a corpus sheet to an image so the live tier can exercise the
 * READ stage without real photos.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const REAL_DIR = path.join(ROOT, 'sheets');
const GOLD = new Set(['correct', 'has_error', 'blank']);
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function corpusSheets() {
  return require('./corpus.json').sheets;
}

/**
 * Validate one sheet's labels. Returns a list of problems (empty = valid).
 * Shared by the hermetic format check and the live loader.
 */
function validateSheet(sheet, { real = false } = {}) {
  const errs = [];
  if (!sheet || typeof sheet.id !== 'string' || !sheet.id) errs.push('missing id');
  if (!Array.isArray(sheet.problems) || !sheet.problems.length) errs.push('no problems');
  if (real) {
    if (sheet.consent !== true) errs.push('consent must be true (see sheets/README.md)');
    if (!['teacher-sample', 'consented-student'].includes(sheet.source)) errs.push('source must be teacher-sample or consented-student');
    if (!Array.isArray(sheet.pages) || !sheet.pages.length) errs.push('pages[] is required');
  }
  const labels = new Set();
  (sheet.problems || []).forEach((p, i) => {
    const at = `problem[${i}]`;
    if (typeof p.label !== 'string' || !p.label) errs.push(`${at}: label`);
    else if (labels.has(p.label)) errs.push(`${at}: duplicate label ${p.label}`);
    labels.add(p.label);
    if (!GOLD.has(p.gold)) errs.push(`${at}: gold must be correct | has_error | blank`);
    if (typeof p.problem !== 'string' || !p.problem) errs.push(`${at}: problem text`);
    if (!Array.isArray(p.steps)) errs.push(`${at}: steps[]`);
    if (p.gold === 'blank' && p.answer) errs.push(`${at}: a blank problem has no answer`);
    if (p.gold !== 'blank' && !p.answer) errs.push(`${at}: answer is required unless blank`);
    if (p.gold === 'has_error' && !p.errorLine) errs.push(`${at}: errorLine is required for has_error`);
  });
  return errs;
}

/** Real sheets: [{ ...labels.json, dir, images: [vision content blocks] }]. */
function realSheets() {
  if (!fs.existsSync(REAL_DIR)) return [];
  return fs.readdirSync(REAL_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const dir = path.join(REAL_DIR, d.name);
      const labelsPath = path.join(dir, 'labels.json');
      if (!fs.existsSync(labelsPath)) return { id: d.name, dir, invalid: ['labels.json missing'] };
      const sheet = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
      const invalid = validateSheet(sheet, { real: true });
      (sheet.pages || []).forEach(pg => { if (!fs.existsSync(path.join(dir, pg))) invalid.push(`page ${pg} missing`); });
      return { ...sheet, dir, invalid };
    });
}

function imageBlock(buffer, mime) {
  return { type: 'image_url', image_url: { url: `data:${mime};base64,${buffer.toString('base64')}`, detail: 'high' } };
}

function realSheetImages(sheet) {
  return sheet.pages.map(pg => imageBlock(fs.readFileSync(path.join(sheet.dir, pg)), MIME[path.extname(pg).toLowerCase()] || 'image/jpeg'));
}

/** The transcription the grader would ideally read off this sheet. */
function goldTranscription(sheet) {
  return sheet.problems.map(p => ({
    label: p.label,
    problem: p.problem,
    steps: p.steps.slice(),
    answer: p.gold === 'blank' ? null : p.answer,
    legibility: p.gold === 'blank' ? 'blank' : 'clear',
  }));
}

// ── Rendering a corpus sheet to an image ───────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Deterministic jitter so every run renders the same "handwriting".
function prng(seed) {
  let x = 0;
  for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; };
}

/** Render a corpus sheet as a JPEG: printed problems, "handwritten" work. */
async function renderSheet(sheet) {
  const sharp = require('sharp');
  const rand = prng(sheet.id);
  const W = 1100;
  const rows = [];
  let y = 70;
  rows.push(`<text x="40" y="${y}" font-family="DejaVu Sans" font-size="30" font-weight="bold" fill="#111">${esc(sheet.title || sheet.id)}</text>`);
  y += 30;
  for (const p of sheet.problems) {
    y += 52;
    rows.push(`<text x="40" y="${y}" font-family="DejaVu Sans" font-size="26" fill="#111">${esc(p.label)})  ${esc(p.problem)}</text>`);
    const written = p.gold === 'blank' ? [] : [...p.steps, `Answer: ${p.answer}`];
    for (const line of written) {
      y += 42;
      const dx = 90 + Math.round(rand() * 14);
      const rot = (rand() - 0.5) * 2.4;
      rows.push(`<text x="${dx}" y="${y}" transform="rotate(${rot.toFixed(2)} ${dx} ${y})" font-family="FreeSans" font-style="oblique" font-size="${28 + Math.round(rand() * 3)}" fill="#1c3f94">${esc(line)}</text>`);
    }
    if (p.gold === 'blank') y += 60;
  }
  const H = y + 70;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fbfaf4"/>${rows.join('')}</svg>`;
  const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
  return { buffer, image: imageBlock(buffer, 'image/jpeg') };
}

module.exports = { corpusSheets, realSheets, realSheetImages, validateSheet, goldTranscription, renderSheet, REAL_DIR };
