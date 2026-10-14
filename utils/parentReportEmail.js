'use strict';
/* ============================================================
   parentReportEmail.js — the progress email, rendered FROM the Learning Report.

   The email used to be fed by two private copies of the report logic (the
   digest script's calculateStudentProgress/buildDigestInsights, and the
   "send report now" route), which had drifted: "mastered" counted placement,
   struggling skills went out as raw ids, accuracy read 0% on zero problems,
   and minutes were lifetime minutes under a weekly heading. Now the email is a
   view of utils/parentReport.buildLearningReport — the same object the
   dashboard modal shows — in the parent's language.
   ============================================================ */

const { renderMessage, periodPhrase, normalizeLanguage } = require('./parentReportText');

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const LANG_CODE = {
  English: 'en', Spanish: 'es', Russian: 'ru', Chinese: 'zh', Vietnamese: 'vi',
  Arabic: 'ar', Somali: 'so', French: 'fr', German: 'de',
};

const TONE = {
  positive: { bg: '#f0fdf4', border: '#27ae60' },
  concern: { bg: '#fff5f5', border: '#e74c3c' },
  actionable: { bg: '#eff6ff', border: '#3b82f6' },
  neutral: { bg: '#f8f9fa', border: '#6c757d' },
};

/**
 * @param {Object} parent  { firstName, email, parentLanguage }
 * @param {Object} report  buildLearningReport(...) output
 * @returns {{ subject: string, html: string, text: string }}
 */
function renderReportEmail(parent, report) {
  const lang = normalizeLanguage(report.language || (parent && parent.parentLanguage));
  const t = (key, params = {}) => renderMessage(key, { days: report.period && report.period.days, ...params }, lang);
  const name = report.child.firstName;
  const period = periodPhrase(report.period && report.period.days, lang);
  const rtl = lang === 'Arabic';
  const baseUrl = process.env.BASE_URL || 'https://www.mathmatix.ai';
  const snap = report.weeklySnapshot.thisWeek;
  const counts = report.mastery.counts;
  const inProgress = Math.max(0, counts.practiced - counts.practicedMastered - counts.needsReview);

  const subject = t('email.subject', { name, period });
  // No first name on file → no greeting line (never "Hola, :").
  const greeting = parent && parent.firstName ? t('email.greeting', { parent: parent.firstName }) : '';

  const insightsHtml = report.insights.map((i) => {
    const s = TONE[i.tone] || TONE.neutral;
    const side = rtl ? 'right' : 'left';
    return `<div style="padding:12px 16px;background:${s.bg};border-${side}:3px solid ${s.border};border-radius:4px;margin-bottom:8px;font-size:14px;color:#333;">${esc(i.message)}</div>`;
  }).join('');

  const stat = (label, value) => `<td style="padding:10px;text-align:center;width:25%;">
      <div style="font-size:22px;font-weight:700;color:#2c3e50;">${esc(value)}</div>
      <div style="font-size:12px;color:#6c757d;">${esc(label)}</div></td>`;

  const tags = (items) => items.map((x) => `<span style="display:inline-block;padding:4px 10px;margin:0 6px 6px 0;border-radius:12px;background:#f1f3f5;font-size:13px;color:#333;">${esc(x)}</span>`).join('');

  const strengths = report.mastery.topStrengths.map((s) => s.displayName);
  const review = report.mastery.growthAreas.map((s) => s.displayName);

  const html = `<!DOCTYPE html>
<html lang="${LANG_CODE[lang] || 'en'}"${rtl ? ' dir="rtl"' : ''}>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f9fa;">
  <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;">
    <div style="background:#fff;border-bottom:4px solid #667eea;padding:20px;text-align:center;">
      <img src="${esc(baseUrl)}/images/mathmatix-ai-logoheader.png" alt="MATHMATIX AI" style="max-width:260px;height:auto;">
    </div>
    <div style="padding:24px 20px 8px;">
      ${greeting ? `<h2 style="margin:0 0 8px;color:#2c3e50;font-size:20px;">${esc(greeting)}</h2>` : ''}
      <p style="margin:0;color:#555;font-size:16px;line-height:1.6;">${esc(t('email.intro', { name, period }))}</p>
      <p style="margin:12px 0 0;color:#2c3e50;font-size:18px;font-weight:600;">${esc(report.headline.text)}</p>
    </div>
    ${insightsHtml ? `<div style="padding:12px 20px;"><h3 style="margin:0 0 10px;color:#2c3e50;font-size:16px;">${esc(t('email.insights'))}</h3>${insightsHtml}</div>` : ''}
    <div style="padding:12px 20px;">
      <h3 style="margin:0 0 6px;color:#2c3e50;font-size:16px;">${esc(t('email.glance'))}</h3>
      <table role="presentation" style="width:100%;border-collapse:collapse;background:#f8f9fa;border-radius:8px;"><tr>
        ${stat(t('email.stat.sessions'), snap.sessions)}
        ${stat(t('email.stat.minutes'), snap.minutes)}
        ${stat(t('email.stat.problems'), snap.problemsAttempted)}
        ${stat(t('email.stat.accuracy'), snap.accuracy === null || snap.problemsAttempted < 5 ? '—' : `${snap.accuracy}%`)}
      </tr></table>
      ${counts.practiced > 0 ? `<p style="margin:12px 0 0;font-size:14px;color:#333;">${esc(t('email.skills', { mastered: counts.practicedMastered, inProgress, review: counts.needsReview }))}</p>` : ''}
      ${counts.placedOut > 0 ? `<p style="margin:6px 0 0;font-size:13px;color:#6c757d;">${esc(t('email.placed', { n: counts.placedOut }))}</p>` : ''}
    </div>
    ${strengths.length ? `<div style="padding:8px 20px;"><h3 style="margin:0 0 8px;color:#2c3e50;font-size:15px;">${esc(t('email.strengths'))}</h3>${tags(strengths)}</div>` : ''}
    ${review.length ? `<div style="padding:8px 20px;"><h3 style="margin:0 0 8px;color:#2c3e50;font-size:15px;">${esc(t('email.review'))}</h3>${tags(review)}</div>` : ''}
    <div style="padding:20px;text-align:center;">
      <a href="${esc(baseUrl)}/parent-dashboard.html" style="display:inline-block;background:#667eea;color:#fff;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">${esc(t('email.cta'))}</a>
    </div>
    <div style="padding:16px 20px;background:#f8f9fa;color:#6c757d;font-size:12px;line-height:1.5;text-align:center;">${esc(t('email.footer'))}</div>
  </div>
</body>
</html>`;

  const text = [
    ...(greeting ? [greeting, ''] : []),
    t('email.intro', { name, period }),
    report.headline.text,
    '',
    ...report.insights.map((i) => `• ${i.message}`),
    '',
    `${t('email.stat.sessions')}: ${snap.sessions} · ${t('email.stat.minutes')}: ${snap.minutes} · ${t('email.stat.problems')}: ${snap.problemsAttempted}`,
    '',
    `${t('email.cta')}: ${baseUrl}/parent-dashboard.html`,
    '',
    t('email.footer'),
  ].join('\n');

  return { subject, html, text };
}

module.exports = { renderReportEmail };
