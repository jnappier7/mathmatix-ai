/**
 * utils/teacherAssignments.js — how teacher resources reach the tutor.
 * Before: a raw JSON dump, only when the student happened to name the file,
 * with `category` ignored (a quiz was coached like a practice sheet).
 */
const fs = require('fs');
const path = require('path');
const TA = require('../../utils/teacherAssignments');

const NOW = new Date('2026-10-14T12:00:00Z');

describe('category rules', () => {
  test('tests and quizzes: parallel practice only, never the real items', () => {
    for (const c of ['test', 'quiz', 'Quiz']) {
      expect(TA.usageRules(c)).toMatch(/Do NOT solve, check, or hint at its actual items/);
    }
  });
  test('everything else: work from it, Socratic, no answer key', () => {
    expect(TA.usageRules('worksheet')).toMatch(/never ask the student what it says/);
    expect(TA.usageRules('homework')).toMatch(/never give final answers or an answer key/);
  });
});

describe('renderReferencedResource (the name-triggered lookup)', () => {
  test('instructions, not JSON', () => {
    const out = TA.renderReferencedResource({ displayName: 'Module 6.2', category: 'practice', content: '1) 2x = 8' });
    expect(out).toMatch(/^TEACHER RESOURCE THE STUDENT IS USING: "Module 6.2" \[practice\]/);
    expect(out).toMatch(/1\) 2x = 8/);
    expect(out).not.toMatch(/[{}]"displayName"/);
  });
  test('unknown contents → ask for the problem, never guess', () => {
    expect(TA.renderReferencedResource({ displayName: 'Unit 4 Test', notFound: true })).toMatch(/don't have its contents/);
  });
});

describe('renderTeacherResourceSection', () => {
  const pushed = [{ id: '1', displayName: 'Two-Step Practice', teacherName: 'Ms. Rivera', category: 'practice', note: 'Start with #1', endsAt: new Date('2026-10-24T12:00:00Z'), content: '1) 3x - 7 = 11', started: false }];
  test('carries teacher, note, window and the students-lead rule', () => {
    const out = TA.renderTeacherResourceSection(null, pushed, NOW);
    expect(out).toMatch(/"Two-Step Practice" from Ms\. Rivera \(until/);
    expect(out).toMatch(/Teacher's note to you: Start with #1/);
    expect(out).toMatch(/follow their lead/);
  });
  test('does not repeat a pushed item the student just named', () => {
    const out = TA.renderTeacherResourceSection({ displayName: 'Two-Step Practice', category: 'practice', content: 'x' }, pushed, NOW);
    expect(out.match(/Two-Step Practice/g)).toHaveLength(1);
  });
  test('nothing to say → null (no empty block in the prompt)', () => {
    expect(TA.renderTeacherResourceSection(null, [], NOW)).toBeNull();
  });
});

describe('inWindow', () => {
  test('respects start, end and active', () => {
    expect(TA.inWindow({ active: true }, NOW)).toBe(true);
    expect(TA.inWindow({ active: false }, NOW)).toBe(false);
    expect(TA.inWindow({ active: true, startsAt: new Date(NOW.getTime() + 1000) }, NOW)).toBe(false);
    expect(TA.inWindow({ active: true, endsAt: NOW }, NOW)).toBe(false);
  });
});

describe('wiring', () => {
  const chat = fs.readFileSync(path.join(__dirname, '../../routes/chat.js'), 'utf8');
  test('free chat passes the rendered section, never the raw object', () => {
    expect(chat).toMatch(/const teacherResourceSection = renderTeacherResourceSection\(resourceContext, teacherAssignments/);
    expect(chat).not.toMatch(/errorPatterns, resourceContext, message, formattedMessagesForLLM/);
  });
  test('teacher work leads the greeting CTAs, and Starting Point is only stamped when actually offered', () => {
    const iTeacher = chat.indexOf("type: 'start-teacher-resource'");
    const iSP = chat.indexOf("type: 'launch-starting-point'");
    expect(iTeacher).toBeGreaterThan(-1);
    expect(iTeacher).toBeLessThan(iSP);
    expect(chat).toMatch(/if \(shouldOfferStartingPoint && !greetingInlineCta\)/);
    expect((chat.match(/greetingInlineCta\.type === 'launch-starting-point'\)/g) || []).length).toBe(2);
  });
  test('the client opens pushed work through the normal upload path and records the start', () => {
    const script = fs.readFileSync(path.join(__dirname, '../../public/js/script.js'), 'utf8');
    const block = script.slice(script.indexOf("case 'start-teacher-resource':"), script.indexOf("case 'start-review-warmup':"));
    expect(block).toMatch(/\/start`/);
    expect(block).toMatch(/fetchAndUploadTeacherResource\(cta\.resourceId/);
  });
});
