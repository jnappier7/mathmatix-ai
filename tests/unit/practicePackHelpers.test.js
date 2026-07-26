/**
 * Practice Pack — pure helper tests
 *
 * The worksheet generator was producing zero-problem packs because it
 * looked up theta on the wrong schema path. These tests pin the helpers
 * that resolve theta (canonical: user.currentTheta) and map a stated
 * grade level to a Problem.gradeBand enum.
 */

const router = require('../../routes/practicePack');
const { resolveTheta, gradeLevelToBand } = router.__helpers;

describe('resolveTheta', () => {
  test('prefers user.currentTheta when set', () => {
    expect(resolveTheta({ currentTheta: 1.4 })).toBe(1.4);
    expect(resolveTheta({ currentTheta: 0 })).toBe(0); // zero is valid, not falsy
    expect(resolveTheta({ currentTheta: -2.1 })).toBe(-2.1);
  });

  test('falls back to legacy learningProfile.abilityEstimate.theta if currentTheta missing', () => {
    expect(resolveTheta({ learningProfile: { abilityEstimate: { theta: 0.7 } } })).toBe(0.7);
  });

  test('returns 0 when nothing is set', () => {
    expect(resolveTheta({})).toBe(0);
    expect(resolveTheta(null)).toBe(0);
    expect(resolveTheta(undefined)).toBe(0);
  });

  test('ignores non-numeric theta values', () => {
    expect(resolveTheta({ currentTheta: 'high' })).toBe(0);
    expect(resolveTheta({ learningProfile: { abilityEstimate: { theta: '1.0' } } })).toBe(0);
  });
});

describe('gradeLevelToBand', () => {
  test('maps elementary grades to K-5', () => {
    expect(gradeLevelToBand('K')).toBe('K-5');
    expect(gradeLevelToBand('Kindergarten')).toBe('K-5');
    expect(gradeLevelToBand('Pre-K')).toBe('K-5');
    expect(gradeLevelToBand('1st Grade')).toBe('K-5');
    expect(gradeLevelToBand('5th Grade')).toBe('K-5');
  });

  test('maps middle-school grades to 5-8', () => {
    expect(gradeLevelToBand('6th Grade')).toBe('5-8');
    expect(gradeLevelToBand('7th Grade')).toBe('5-8');
    expect(gradeLevelToBand('8th Grade')).toBe('5-8');
  });

  test('maps high-school grades and courses to 8-12', () => {
    expect(gradeLevelToBand('9th Grade')).toBe('8-12');
    expect(gradeLevelToBand('12th Grade')).toBe('8-12');
    expect(gradeLevelToBand('Algebra 1')).toBe('8-12');
    expect(gradeLevelToBand('Geometry')).toBe('8-12');
    expect(gradeLevelToBand('Pre-Calculus')).toBe('8-12');
  });

  test('maps calculus and beyond', () => {
    expect(gradeLevelToBand('Calculus')).toBe('Calculus');
    expect(gradeLevelToBand('AP Calculus')).toBe('Calculus');
    expect(gradeLevelToBand('Calculus 3')).toBe('Calc 3');
    expect(gradeLevelToBand('Multivariable Calculus')).toBe('Calc 3');
  });

  test('returns null for empty/missing input', () => {
    expect(gradeLevelToBand(null)).toBeNull();
    expect(gradeLevelToBand('')).toBeNull();
    expect(gradeLevelToBand(undefined)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toPdfBuffer — the "PDF downloads but won't open" bug.
//
// Puppeteer v23+ returns page.pdf() as a Uint8Array. Express 4's res.send()
// only treats Buffers as binary; a plain Uint8Array falls through to
// res.json(), which serializes the PDF bytes as {"0":37,"1":80,...} under a
// 200 + application/pdf header — so the client happily saves an unopenable
// file. These tests pin the conversion AND reproduce the transport failure
// mode against real express, so a Puppeteer/Express upgrade that changes the
// contract fails loudly here instead of shipping corrupt downloads.
// ─────────────────────────────────────────────────────────────────────────────
const { toPdfBuffer } = router.__helpers;

describe('toPdfBuffer', () => {
  const PDF_MAGIC = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

  test('converts a Uint8Array to a Buffer, bytes intact', () => {
    const buf = toPdfBuffer(PDF_MAGIC);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString('latin1')).toBe('%PDF-');
  });

  test('passes a real Buffer through untouched', () => {
    const b = Buffer.from('%PDF-');
    expect(toPdfBuffer(b)).toBe(b);
  });

  test('res.send(raw Uint8Array) really does JSON-mangle a PDF — and toPdfBuffer fixes it', async () => {
    const express = require('express');
    const request = require('supertest');
    const app = express();
    app.get('/raw', (req, res) => {
      res.setHeader('Content-Type', 'application/pdf');
      res.send(PDF_MAGIC);                 // the bug
    });
    app.get('/fixed', (req, res) => {
      res.setHeader('Content-Type', 'application/pdf');
      res.send(toPdfBuffer(PDF_MAGIC));    // the fix
    });

    const raw = await request(app).get('/raw').buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(raw.body.toString()).toContain('"0":37');            // JSON byte map, not a PDF

    const fixed = await request(app).get('/fixed').buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(fixed.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The id-seam regression (owner-hit, 2026-07-26): an Absolute Value student's
// "personalized" pack came back as fractions + integers, because the
// skill-targeted Problem query used the mastery-side canonical id against a
// bank keyed by legacy ids — zero matches → silent grade-band fallback.
// Pin that the route sources its candidates from the shared resolver.
// ─────────────────────────────────────────────────────────────────────────────
describe('skill-targeted selection uses id-tolerant lookup', () => {
  test('practicePack routes problem queries through skillLookupCandidates', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../../routes/practicePack'), 'utf8');
    expect(src).toContain("require('../utils/skillCanonicalizer')");
    expect(src).toContain('skillId: { $in: sidCandidates }');
    // Both the banded and the any-difficulty query must use it.
    expect(src.match(/skillId: \{ \$in: sidCandidates \}/g).length).toBe(2);
  });
});
