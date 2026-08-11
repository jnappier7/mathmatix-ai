/**
 * Third-party voice vendors (Deepgram STT, Cartesia TTS) require users to be
 * 13 or older, so a younger student's audio must not reach them.
 *
 * Before this gate was shared, `isUnder13` existed in three copies —
 * routes/voice.js, utils/voiceUpgrade.js, and nowhere at all on /api/speak,
 * which is the endpoint that hands text to Cartesia for synthesis. The
 * consent gate added later did not close it: consent asks whether we may
 * process this student's data, age asks whether a vendor's terms permit this
 * student. A student can hold valid parental consent and still be barred by
 * age.
 */

const { isUnder13, requireThirteenPlus, VOICE_AGE_BLOCK } = require('../../middleware/ageGate');

const yearsAgo = (n) => new Date(Date.now() - n * 365.25 * 24 * 60 * 60 * 1000);

describe('isUnder13', () => {
  test.each([
    ['a 9-year-old', yearsAgo(9), true],
    ['a 12-year-old', yearsAgo(12), true],
    ['a 14-year-old', yearsAgo(14), false],
    ['an adult', yearsAgo(40), false]
  ])('%s', (_label, dateOfBirth, expected) => {
    expect(isUnder13({ dateOfBirth })).toBe(expected);
  });

  test('the boundary: just under 13 is blocked, just over is not', () => {
    expect(isUnder13({ dateOfBirth: yearsAgo(12.99) })).toBe(true);
    expect(isUnder13({ dateOfBirth: yearsAgo(13.01) })).toBe(false);
  });

  describe('when age cannot be determined', () => {
    // Documented limitation, carried over deliberately: no DOB means we allow.
    // public/privacy.html is worded to match ("where a date of birth is on
    // file"). If this ever flips to deny-by-default, that sentence must change
    // with it.
    test.each([
      ['no dateOfBirth', {}],
      ['null user', null],
      ['undefined user', undefined],
      ['unparseable dateOfBirth', { dateOfBirth: 'not-a-date' }]
    ])('%s → not blocked', (_label, user) => {
      expect(isUnder13(user)).toBe(false);
    });
  });
});

describe('requireThirteenPlus', () => {
  const run = (user) => {
    const req = { user };
    const res = {
      statusCode: null,
      body: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; }
    };
    const next = jest.fn();
    requireThirteenPlus(req, res, next);
    return { res, next };
  };

  test('blocks an under-13 user with 403 and does not call next', () => {
    const { res, next } = run({ dateOfBirth: yearsAgo(10) });
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('the 403 body carries useWebSpeech, which the client keys on', () => {
    // public/js/voice-controller.js checks `status === 403 && errorData.useWebSpeech`
    // to fall back to browser-native speech instead of surfacing a raw error.
    const { res } = run({ dateOfBirth: yearsAgo(10) });
    expect(res.body.useWebSpeech).toBe(true);
    expect(res.body).toEqual(VOICE_AGE_BLOCK);
  });

  test('does not hand the caller a mutable reference to the shared payload', () => {
    const { res } = run({ dateOfBirth: yearsAgo(10) });
    res.body.message = 'mutated';
    expect(VOICE_AGE_BLOCK.message).not.toBe('mutated');
  });

  test.each([
    ['a 14-year-old', { dateOfBirth: yearsAgo(14) }],
    ['a user with no DOB', {}]
  ])('lets %s through', (_label, user) => {
    const { res, next } = run(user);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });
});

describe('the gate is actually mounted on the vendor-voice endpoints', () => {
  // The failure mode that matters is not a wrong comparison — it is the gate
  // being absent. /api/speak shipped text to Cartesia with no age check at all
  // until this change, so pin the mounts rather than trusting review.
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../config/routes.js'), 'utf8');
  const mountLine = (p) =>
    src.split('\n').find((l) => l.includes(`app.use('${p}'`) && l.includes('Routes'));

  test.each(['/api/speak', '/api/voice'])('%s carries requireThirteenPlus', (p) => {
    expect(mountLine(p)).toContain('requireThirteenPlus');
  });

  test('the age gate runs before the rate limiter, so a blocked user cannot burn quota', () => {
    const line = mountLine('/api/voice');
    expect(line.indexOf('requireThirteenPlus')).toBeLessThan(line.indexOf('aiEndpointLimiter'));
  });

  test('the voice-tutor WebSocket is gated at the upgrade, not the router', () => {
    // A WS upgrade never traverses the Express stack, so route middleware
    // cannot cover it — utils/voiceUpgrade.js must do the check itself.
    const upgrade = fs.readFileSync(path.join(__dirname, '../../utils/voiceUpgrade.js'), 'utf8');
    expect(upgrade).toContain('isUnder13');
    expect(upgrade).toContain("require('../middleware/ageGate')");
  });

  test('there is exactly one implementation of the age check', () => {
    // It previously existed in three places and drifted out of one of them.
    const roots = ['routes', 'utils', 'middleware'];
    const defs = [];
    for (const root of roots) {
      const dir = path.join(__dirname, '../..', root);
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.js')) continue;
        const body = fs.readFileSync(path.join(dir, f), 'utf8');
        if (/function\s+isUnder13\s*\(/.test(body)) defs.push(`${root}/${f}`);
      }
    }
    expect(defs).toEqual(['middleware/ageGate.js']);
  });
});
