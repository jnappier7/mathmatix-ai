// The progress email is a view of the Learning Report, in the parent's language.
const { renderReportEmail } = require('../../utils/parentReportEmail');

function report(over = {}) {
  return {
    language: 'English',
    period: { days: 7 },
    child: { firstName: 'Ana' },
    headline: { text: 'Ana is putting in the work', tone: 'building' },
    insights: [{ tone: 'positive', message: 'Ana had 3 sessions in the last 7 days.' }],
    weeklySnapshot: { thisWeek: { sessions: 3, minutes: 40, problemsAttempted: 2, accuracy: 100 } },
    mastery: {
      counts: { practiced: 4, practicedMastered: 1, learning: 2, needsReview: 1, placedOut: 18 },
      topStrengths: [{ displayName: 'Function Basics' }],
      growthAreas: [{ displayName: 'Sequences' }],
    },
    ...over,
  };
}

test('subject, greeting and sections in English', () => {
  const { subject, html, text } = renderReportEmail({ firstName: 'Elena' }, report());
  expect(subject).toBe("Ana's math progress in the last 7 days");
  expect(html).toContain('Hi Elena,');
  expect(html).toContain('Practiced skills: 1 mastered, 2 in progress, 1 need review.');
  expect(html).toContain('Plus 18 skills placed out of by the placement test.');
  expect(text).toContain('• Ana had 3 sessions in the last 7 days.');
});

test('accuracy on fewer than 5 problems shows a dash, never "100%"', () => {
  const { html } = renderReportEmail({ firstName: 'Elena' }, report());
  expect(html).not.toMatch(/>100%</);
});

test('Spanish parent gets Spanish chrome and a period that matches the window', () => {
  const { subject, html } = renderReportEmail({ firstName: 'Elena' }, report({ language: 'Spanish', period: { days: 30 } }));
  expect(subject).toBe('El progreso en matemáticas de Ana en los últimos 30 días');
  expect(html).toContain('Hola, Elena:');
  expect(html).toContain('Abrir el panel para padres');
});

test('Arabic is laid out right-to-left', () => {
  const { html } = renderReportEmail({ firstName: 'Elena' }, report({ language: 'Arabic' }));
  expect(html).toMatch(/<html lang="ar" dir="rtl">/);
});

test('every interpolated string is escaped', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const { html } = renderReportEmail({ firstName: evil }, report({
    child: { firstName: evil },
    insights: [{ tone: 'neutral', message: evil }],
    mastery: { counts: { practiced: 0, practicedMastered: 0, learning: 0, needsReview: 0, placedOut: 0 }, topStrengths: [{ displayName: evil }], growthAreas: [] },
  }));
  expect(html).not.toContain('<img src=x');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
});

test('no first name → no greeting line, never "Hola, :"', () => {
  const { html } = renderReportEmail({}, report({ language: 'Spanish' }));
  expect(html).not.toMatch(/Hola,\s*:/);
});
