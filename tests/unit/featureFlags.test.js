/**
 * Server-controlled client flags (utils/featureFlags.js).
 *
 * The owner's Render dashboard action — `livingWorkspace=live` — must be the
 * authoritative switch. Whitelist-only emission: nothing from the env is ever
 * interpolated raw into the served script.
 */
const { buildFeaturesScript, LWS_MODES } = require('../../utils/featureFlags');

describe('buildFeaturesScript', () => {
  test('the exact dashboard spelling works: livingWorkspace=live', () => {
    const js = buildFeaturesScript({ livingWorkspace: 'live' });
    expect(js).toContain('"livingWorkspace":"live"');
  });

  test('SCREAMING_SNAKE convention works and wins jointly', () => {
    expect(buildFeaturesScript({ LIVING_WORKSPACE: 'off' })).toContain('"livingWorkspace":"off"');
    for (const mode of LWS_MODES) {
      expect(buildFeaturesScript({ LIVING_WORKSPACE: mode })).toContain(`"livingWorkspace":"${mode}"`);
    }
  });

  test('invalid or absent values emit NO override — chat.html defaults stand', () => {
    for (const env of [{}, { livingWorkspace: 'banana' }, { livingWorkspace: '' }, { livingWorkspace: 'LIVE ' }]) {
      const js = buildFeaturesScript(env);
      expect(js).not.toContain('livingWorkspace"');
      expect(js).toContain('window.MM_FEATURES = window.MM_FEATURES || {};');
    }
  });

  test('injection-shaped env values can never reach the script raw', () => {
    const js = buildFeaturesScript({ livingWorkspace: '";alert(1);//', COURSES_FEATURE: '1;evil()' });
    expect(js).not.toContain('alert');
    expect(js).not.toContain('evil');
  });

  test('courses boolean flag parses 1/0/true/false only', () => {
    expect(buildFeaturesScript({ COURSES_FEATURE: '0' })).toContain('"courses":false');
    expect(buildFeaturesScript({ COURSES_FEATURE: 'true' })).toContain('"courses":true');
    expect(buildFeaturesScript({ COURSES_FEATURE: 'maybe' })).not.toContain('courses');
  });

  test('chat.html loads the override BEFORE the seed, so env wins the merge', () => {
    const fs = require('fs');
    const html = fs.readFileSync(require.resolve('../../public/chat.html'), 'utf8');
    const override = html.indexOf('/api/features.js');
    const seed = html.indexOf('window.MM_FEATURES = Object.assign({ boardPanel');
    expect(override).toBeGreaterThan(-1);
    expect(seed).toBeGreaterThan(-1);
    expect(override).toBeLessThan(seed);
  });
});
