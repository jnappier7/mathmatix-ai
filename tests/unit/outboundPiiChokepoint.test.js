/**
 * The outbound PII strip has to sit where it cannot be bypassed.
 *
 * The arrangement this replaces put anonymization inside llmGateway's chat()
 * wrappers, then re-exported callLLM / callLLMStream / callLLMStructured from
 * openaiClient UNWRAPPED under a "low-level direct access" comment. 68 call
 * sites across 27 files imported those, so student names, emails and IEP
 * specifics reached the providers untouched — and nothing outside
 * llmGateway.js ever called anonymizeMessages at all.
 *
 * The strip now runs at the top of all three entry points, ahead of the
 * provider dispatch, so it covers the OpenAI and Anthropic paths alike.
 *
 * It is gated on PII_STRIP_OUTBOUND so turning it on is a deliberate
 * per-environment decision. These tests drive the gate both ways: OFF must be
 * byte-for-byte pass-through, because that is what production runs today.
 */

const { stripOutboundPII } = require('../../utils/openaiClient');
const { createAnonymizationContext } = require('../../utils/piiAnonymizer');

const ORIGINAL_FLAG = process.env.PII_STRIP_OUTBOUND;

const enable = () => { process.env.PII_STRIP_OUTBOUND = 'true'; };
const disable = () => { delete process.env.PII_STRIP_OUTBOUND; };

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.PII_STRIP_OUTBOUND;
  else process.env.PII_STRIP_OUTBOUND = ORIGINAL_FLAG;
});

const messages = () => ([
  { role: 'system', content: 'Tutoring Zoe Quill (zoe@school.org), id 507f1f77bcf86cd799439011.' },
  { role: 'user', content: 'Call me on (555) 123-4567. The product is 1234567890.' }
]);

describe('stripOutboundPII — disabled (production default)', () => {
  test('returns the messages untouched', () => {
    disable();
    const input = messages();
    expect(stripOutboundPII(input)).toBe(input);
  });

  test('is off when the flag is any value other than "true"', () => {
    process.env.PII_STRIP_OUTBOUND = '1';
    const input = messages();
    expect(stripOutboundPII(input)).toBe(input);
  });
});

describe('stripOutboundPII — enabled, no caller context', () => {
  beforeEach(enable);

  test('strips the patterns that need no knowledge of the user', () => {
    const [system, user] = stripOutboundPII(messages());
    expect(system.content).toContain('[email]');
    expect(system.content).toContain('[id]');
    expect(user.content).toContain('[phone]');
  });

  test('leaves the student answer that merely looks like an identifier', () => {
    const [, user] = stripOutboundPII(messages());
    expect(user.content).toContain('1234567890');
  });

  test('cannot strip a bare name without context, and does not pretend to', () => {
    // The honest limit of a context-free chokepoint: names need a name map.
    const [system] = stripOutboundPII(messages());
    expect(system.content).toContain('Zoe');
  });

  test('does not mutate the caller\'s array', () => {
    const input = messages();
    const before = input[0].content;
    stripOutboundPII(input);
    expect(input[0].content).toBe(before);
  });

  test('passes non-array payloads straight through', () => {
    expect(stripOutboundPII(undefined)).toBeUndefined();
    expect(stripOutboundPII(null)).toBeNull();
  });
});

describe('stripOutboundPII — enabled, with an anonymization context', () => {
  beforeEach(enable);

  test('strips names once the caller supplies who to look for', () => {
    const anonContext = createAnonymizationContext({ firstName: 'Zoe', lastName: 'Quill' });
    const [system] = stripOutboundPII(messages(), { anonContext });
    expect(system.content).not.toContain('Zoe');
    expect(system.content).toContain('[Student]');
  });

  test('still refuses to strip a name that is also math vocabulary', () => {
    const anonContext = createAnonymizationContext({ firstName: 'Ray', lastName: 'Patel' });
    const [msg] = stripOutboundPII(
      [{ role: 'user', content: 'How do I draw a ray from point A?' }],
      { anonContext }
    );
    expect(msg.content).toBe('How do I draw a ray from point A?');
  });

  test('leaves the image part of a vision payload alone', () => {
    const anonContext = createAnonymizationContext({ firstName: 'Zoe', lastName: 'Quill' });
    const [msg] = stripOutboundPII([{
      role: 'user',
      content: [
        { type: 'text', text: 'Grade Zoe Quill\'s work' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }
      ]
    }], { anonContext });

    expect(msg.content[0].text).toContain('[Student]');
    expect(msg.content[1].image_url.url).toBe('data:image/png;base64,AAAA');
  });
});

describe('the three entry points all route through the chokepoint', () => {
  // Guards against a future entry point being added without the strip. The
  // whole point of a chokepoint is that there is no way around it.
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../utils/openaiClient.js'), 'utf8');

  test.each(['callLLM', 'callLLMStructured', 'callLLMStream'])(
    '%s strips before dispatching to a provider',
    (fn) => {
      const body = src.slice(src.indexOf(`async function ${fn}(`));
      const strip = body.indexOf('stripOutboundPII(messages');
      const dispatch = body.indexOf('anthropicClient');
      expect(strip).toBeGreaterThan(-1);
      expect(strip).toBeLessThan(dispatch);
    }
  );
});

describe('the flag is discoverable by whoever sets up a deployment', () => {
    // The chokepoint is off unless PII_STRIP_OUTBOUND=true, and for a while
    // nothing in the repo said so: not .env.example, not render.yaml, not docs.
    // A deploy built from the template ran with the tutoring path unfiltered and
    // no one was told. The template is where the person configuring Render
    // looks, so the flag has to be explained there.
    test('.env.example documents PII_STRIP_OUTBOUND and what it covers', () => {
        const fs = require('fs');
        const path = require('path');
        const example = fs.readFileSync(path.join(__dirname, '..', '..', '.env.example'), 'utf8');
        expect(example).toMatch(/PII_STRIP_OUTBOUND/);
        expect(example).toMatch(/\[Student\]/);
        expect(example).toMatch(/Off by default/);
    });
});
