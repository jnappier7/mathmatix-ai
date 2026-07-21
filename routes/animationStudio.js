// routes/animationStudio.js
// Producer endpoints for the rig Animation Studio (/animation-studio.html):
// tutor list + LLM script generation for explainer videos. Voiceover TTS
// reuses POST /api/speak; everything downstream (lip-sync, gestures, WebM
// export) runs client-side in the studio.
const express = require('express');
const path = require('path');
const router = express.Router();
const { callLLMStructured } = require('../utils/llmGateway');
const TUTOR_CONFIG = require('../utils/tutorConfig');
const RigCore = require('../public/js/rig/rig-core');
// The rig definition the clip generator validates against (plain JSON).
const RIG = require(path.join(__dirname, '../public/rigs/mr-nappier/rig.json'));

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
    voiceId: t.cartesiaVoiceId,
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

// ---------------------------------------------------------------------------
// POST /api/animation-studio/clip — text-to-animation: the LLM authors
// keyframes for the rig; the server parses, clamps, and validates them
// against rig.json before anything reaches the studio.
// { prompt, durationHint? } → { clip }

const CLIP_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'rig_clip',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        duration: { type: 'number' },
        loop: { type: 'boolean' },
        tracks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              track: { type: 'string' },
              keys: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    t: { type: 'number' },
                    // always a string; numeric tracks are parsed server-side
                    v: { type: 'string' },
                    e: { type: 'string' },
                  },
                  required: ['t', 'v', 'e'],
                },
              },
            },
            required: ['track', 'keys'],
          },
        },
      },
      required: ['name', 'duration', 'loop', 'tracks'],
    },
  },
};

const CHANNEL_CLAMPS = {
  rotation: 170, x: 300, y: 300,
};

const MOTION_BRIEF = `You author keyframe animation clips for a 2D cutout rig of a friendly math
tutor (front-facing, 1024x1536 canvas, y grows DOWN, rotations in degrees, positive = clockwise).

BONES (FK; children inherit parent motion). Channels per bone: rotation, x, y, scaleX, scaleY, opacity.
- root: whole body. root.y negative = jump/hop up (-30..-80). root.rotation = lean (max ±4).
- torso (parent of arms/head): lean ±4, breathe via scaleY 1.00-1.02.
- head: tilt rotation ±6, nod via y 0..14, lift via y -8.
- upper_arm_L / forearm_L / hand_L: the character's LEFT arm = viewer's RIGHT side.
  NEGATIVE rotation raises it outward/up. Shoulder ±60, elbow ±110, wrist ±35.
- upper_arm_R / forearm_R / hand_R: viewer's LEFT side. POSITIVE rotation raises it outward/up.
- thigh_L/R, shin_L/R, foot_L/R: legs (steps, kicks). Thigh ±35, shin ±60, foot ±25.
- eye_L, eye_R: translate x/y ±5 to look around (move both together).
- tie: usually leave alone (physics handles it).

SLOT TRACKS (string states, step-changed): "slots.eye_L"/"slots.eye_R": open|closed;
"slots.mouth": rest|ah; "slots.brow_L"/"slots.brow_R": rest|raised;
"slots.hand_L"/"slots.hand_R": rest|point|thumb|spread (point = index finger,
thumb = thumbs-up — pair with forearm raised to ~±90..100 so the thumb reads upright,
spread = open palm for waves/high-fives).

EASINGS (the 'e' of a key eases the segment LEAVING it): linear, inQuad, outQuad, inOutQuad,
inCubic, outCubic, inOutCubic, inOutSine, outBack (overshoot), outElastic, outBounce, step.
Slot tracks must always use "step".

TRACK NAME FORMAT: "<bone>.<channel>" (e.g. "forearm_L.rotation") or "slots.<slot>".
Key values 'v' are ALWAYS strings: numbers as "12.5", slot states as "ah".

CRAFT RULES: duration 0.4-8s. Use anticipation (small counter-move before a big move),
outBack for energetic arrivals, inOutSine for gentle sways. One-shot clips (loop=false)
must return every numeric track to 0 (scales to 1) at the end and reset slots to their
rest states. Looping clips must have identical first and last key values per track.
Animate few bones well rather than many badly. Keep faces alive: brows and mouth sell emotion.`;

router.post('/clip', isTeacherOrAdmin, async (req, res) => {
  const prompt = String(req.body.prompt || '').trim().slice(0, 400);
  if (!prompt) return res.status(400).json({ success: false, message: 'Missing prompt.' });
  const durationHint = Math.min(8, Math.max(0.4, parseFloat(req.body.durationHint) || 0));

  const parseClip = (raw) => {
    const clip = {
      name: String(raw.name || 'generated').trim().slice(0, 40) || 'generated',
      duration: Math.min(8, Math.max(0.4, Number(raw.duration) || 2)),
      loop: !!raw.loop,
      fps: 30,
      tracks: {},
    };
    for (const entry of Array.isArray(raw.tracks) ? raw.tracks : []) {
      const name = String(entry.track || '');
      const isSlot = name.startsWith('slots.');
      const keys = [];
      for (const k of Array.isArray(entry.keys) ? entry.keys : []) {
        const t = Math.min(clip.duration, Math.max(0, Number(k.t)));
        if (!Number.isFinite(t)) continue;
        if (isSlot) {
          keys.push({ t, v: String(k.v), e: 'step' });
        } else {
          let v = parseFloat(k.v);
          if (!Number.isFinite(v)) continue;
          const prop = name.split('.')[1];
          if (CHANNEL_CLAMPS[prop]) v = Math.max(-CHANNEL_CLAMPS[prop], Math.min(CHANNEL_CLAMPS[prop], v));
          if (prop === 'scaleX' || prop === 'scaleY') v = Math.max(0.5, Math.min(1.5, v));
          if (prop === 'opacity') v = Math.max(0, Math.min(1, v));
          const key = { t, v: Math.round(v * 100) / 100 };
          if (k.e && RigCore.EASINGS[k.e]) key.e = k.e;
          keys.push(key);
        }
      }
      if (keys.length) clip.tracks[name] = RigCore.sortKeys(keys);
    }
    return clip;
  };

  const messages = [
    { role: 'system', content: MOTION_BRIEF },
    {
      role: 'user',
      content: `Author a clip for: "${prompt}".`
        + (durationHint ? ` Target duration ≈ ${durationHint}s.` : ''),
    },
  ];

  try {
    let clip = null;
    let errors = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await callLLMStructured('gpt-4o', messages, CLIP_FORMAT, {
        temperature: 0.6,
        max_tokens: 3000,
      });
      clip = parseClip(raw);
      errors = RigCore.validateClip(clip, RIG);
      if (Object.keys(clip.tracks).length === 0) errors.push('clip has no usable tracks');
      if (!errors.length) break;
      // one repair round: feed the validation errors back
      messages.push(
        { role: 'assistant', content: JSON.stringify(raw) },
        { role: 'user', content: `That clip failed validation: ${errors.join('; ')}. Fix those issues and return the corrected clip.` },
      );
    }
    if (errors.length) {
      return res.status(502).json({ success: false, message: 'Clip generation failed validation: ' + errors[0] });
    }
    res.json({ clip });
  } catch (err) {
    console.error('[animation-studio] clip generation failed:', err.message);
    res.status(502).json({ success: false, message: 'Clip generation failed.' });
  }
});

module.exports = router;
