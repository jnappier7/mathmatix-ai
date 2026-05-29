/**
 * turnTypeAudit — observes pedagogical-consistency mismatches
 * between the model's declared turn_type and the structured
 * board_commands it emitted.
 *
 * Phase 3 policy: report only, never mutate. These tests pin the
 * report shape so Phase 5's "act on hard mismatches" extension
 * has a stable contract to build against.
 */

const { auditTurn, SEVERITY } = require('../../utils/turnTypeAudit');

function cmds(...actions) {
  return actions.map((a) => ({ action: a }));
}

describe('turnTypeAudit — hard mismatches', () => {
  test('problem_introduction with no pose is a HARD mismatch', () => {
    const out = auditTurn({
      turnType: 'problem_introduction',
      boardCommands: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe(SEVERITY.HARD);
    expect(out[0].kind).toBe('problem_introduction_missing_pose');
    expect(out[0].turn_type).toBe('problem_introduction');
    expect(out[0].actions).toEqual([]);
  });

  test('problem_introduction with a pose passes cleanly', () => {
    const out = auditTurn({
      turnType: 'problem_introduction',
      boardCommands: cmds('pose'),
    });
    expect(out).toEqual([]);
  });

  test('problem_introduction with pose + image passes (reference + pose)', () => {
    const out = auditTurn({
      turnType: 'problem_introduction',
      boardCommands: cmds('pose', 'image'),
    });
    expect(out).toEqual([]);
  });
});

describe('turnTypeAudit — soft mismatches', () => {
  test('verification without verify is a SOFT mismatch', () => {
    const out = auditTurn({
      turnType: 'verification',
      boardCommands: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe(SEVERITY.SOFT);
    expect(out[0].kind).toBe('verification_missing_verify');
  });

  test('concept_reference without image OR graph is SOFT', () => {
    const out = auditTurn({
      turnType: 'concept_reference',
      boardCommands: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('concept_reference_missing_visual');
  });

  test('concept_reference with image passes', () => {
    const out = auditTurn({
      turnType: 'concept_reference',
      boardCommands: cmds('image'),
    });
    expect(out).toEqual([]);
  });

  test('concept_reference with graph passes', () => {
    const out = auditTurn({
      turnType: 'concept_reference',
      boardCommands: cmds('graph'),
    });
    expect(out).toEqual([]);
  });

  test('feedback with a pose card is SOFT (work-advancing on a non-advancing turn)', () => {
    const out = auditTurn({
      turnType: 'feedback',
      boardCommands: cmds('pose'),
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('non_advancing_turn_with_board_action');
    expect(out[0].message).toMatch(/pose/);
  });

  test('scaffold with verify is SOFT (premature confirmation)', () => {
    const out = auditTurn({
      turnType: 'scaffold',
      boardCommands: cmds('verify'),
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('non_advancing_turn_with_board_action');
  });

  test('small_talk with no board cards passes', () => {
    expect(auditTurn({ turnType: 'small_talk', boardCommands: [] })).toEqual([]);
  });

  test('feedback with an image reference card is allowed (image is non-advancing)', () => {
    const out = auditTurn({
      turnType: 'feedback',
      boardCommands: cmds('image'),
    });
    expect(out).toEqual([]);
  });
});

describe('turnTypeAudit — step_acknowledgment', () => {
  test('any board content is accepted on step_acknowledgment', () => {
    expect(auditTurn({ turnType: 'step_acknowledgment', boardCommands: [] })).toEqual([]);
    expect(auditTurn({ turnType: 'step_acknowledgment', boardCommands: cmds('apply') })).toEqual([]);
    expect(auditTurn({ turnType: 'step_acknowledgment', boardCommands: cmds('apply', 'resolve') })).toEqual([]);
  });
});

describe('turnTypeAudit — defensive', () => {
  test('null turnType reports invalid_turn_type', () => {
    const out = auditTurn({ turnType: null, boardCommands: [] });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('invalid_turn_type');
  });

  test('unknown turnType reports invalid_turn_type', () => {
    const out = auditTurn({ turnType: 'tutor_thinks_out_loud', boardCommands: [] });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('invalid_turn_type');
  });

  test('non-array boardCommands becomes empty actions', () => {
    const out = auditTurn({ turnType: 'problem_introduction', boardCommands: null });
    expect(out).toHaveLength(1);
    expect(out[0].actions).toEqual([]);
  });
});
