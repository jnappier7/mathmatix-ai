// routes/animationStudio.js
// Producer endpoints for the rig Animation Studio (/animation-studio.html):
// tutor list + LLM script generation for explainer videos. Voiceover TTS
// reuses POST /api/speak; everything downstream (lip-sync, gestures, WebM
// export) runs client-side in the studio.
const express = require('express');
const router = express.Router();
const { callLLMStructured } = require('../utils/llmGateway');
const TUTOR_CONFIG = require('../utils/tutorConfig');

// Teacher/admin only — the script endpoint spends LLM tokens and the studio
// is an authoring tool, not a student surface. Mirrors middleware/auth
// hasRole(): roles[] first, legacy role string as fallback.
function isTeacherOrAdmin(req, res, next) {
  const user = req.user;
  const has = (role) => {
    if (!user) return false;
    if (user.roles && user.roles.length > 0) return user.roles.includes(role);
    return String(user.role) === role;
  };
  if (req.isAuthenticated && req.isAuthenticated() && (has('teacher') || has('admin'))) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Forbidden: Teachers or admins only.' });
}

const GESTURES = ['none', 'wave', 'nod', 'thinking', 'celebrate', 'point', 'point_up', 'present', 'tap', 'explain', 'thumbs_up'];

const SCRIPT_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'explainer_script',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        segments: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              text: { type: 'string' },
              gesture: { type: 'string', enum: GESTURES },
            },
            required: ['text', 'gesture'],
          },
        },
      },
      required: ['title', 'segments'],
    },
  },
};

// GET /api/animation-studio/tutors — personas the Producer can voice.
router.get('/tutors', isTeacherOrAdmin, (req, res) => {
  const tutors = Object.entries(TUTOR_CONFIG).map(([id, t]) => ({
    id,
    name: t.name,
    voiceId: t.voiceId,
  }));
  res.json({ tutors });
});

// POST /api/animation-studio/script
// { topic, gradeLevel?, targetSeconds?, tutorId? } →
// { title, segments: [{ text, gesture }] }
router.post('/script', isTeacherOrAdmin, async (req, res) => {
  const topic = String(req.body.topic || '').trim().slice(0, 500);
  if (!topic) return res.status(400).json({ success: false, message: 'Missing topic.' });
  const gradeLevel = String(req.body.gradeLevel || 'middle school').slice(0, 40);
  const targetSeconds = Math.min(180, Math.max(30, parseInt(req.body.targetSeconds, 10) || 75));
  const tutorId = TUTOR_CONFIG[req.body.tutorId] ? req.body.tutorId : 'mr-nappier';
  const persona = TUTOR_CONFIG[tutorId];
  const targetWords = Math.round(targetSeconds * 2.4); // ≈ narration pace

  const messages = [
    {
      role: 'system',
      content:
        'You write spoken narration scripts for short animated K-12 math explainer videos. '
        + 'The narration is read aloud by a text-to-speech voice, so: no stage directions, no '
        + 'markdown, no LaTeX — spell out math in words (say "three fourths", not "3/4"). '
        + 'Return 5 to 8 segments. Each segment is a few sentences of narration plus one gesture '
        + 'cue for the animated character: "wave" only on the greeting segment; "present" when '
        + 'introducing the example or problem; "point" when directing attention to the work '
        + '("look at this step"); "tap" for emphasis on a specific detail; "point_up" for the one '
        + 'key tip or rule; "thinking" when posing a question to the viewer; "nod" for '
        + 'affirmations; "thumbs_up" for praising the viewer after a solved step; "explain" for a '
        + 'longer stretch of instruction; "celebrate" only on the '
        + 'final wrap-up segment; otherwise "none".',
    },
    {
      role: 'user',
      content:
        `Write the narration for a ${targetSeconds}-second (about ${targetWords} words total) `
        + `explainer video on: "${topic}". Audience: ${gradeLevel} students. `
        + `The speaker is ${persona.name}. Persona: ${String(persona.about || '').slice(0, 300)} `
        + 'Keep the tone warm, concrete, and encouraging, with one simple worked example.',
    },
  ];

  try {
    const raw = await callLLMStructured('gpt-4o-mini', messages, SCRIPT_FORMAT, {
      temperature: 0.7,
      max_tokens: 1500,
    });
    const segments = (Array.isArray(raw.segments) ? raw.segments : [])
      .map((s) => ({
        text: String(s.text || '').trim(),
        gesture: GESTURES.includes(s.gesture) ? s.gesture : 'none',
      }))
      .filter((s) => s.text.length > 0)
      .slice(0, 12);
    if (!segments.length) {
      return res.status(502).json({ success: false, message: 'Script generation returned nothing usable.' });
    }
    res.json({ title: String(raw.title || topic).slice(0, 120), segments, tutorId });
  } catch (err) {
    console.error('[animation-studio] script generation failed:', err.message);
    res.status(502).json({ success: false, message: 'Script generation failed.' });
  }
});

module.exports = router;
