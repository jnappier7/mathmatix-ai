/**
 * Tests for Interleaved Practice Engine
 */
const {
  initializeInterleaving,
  shouldInterleave,
  recordFocusedProblem,
  recordInterleavedProblem,
  getInterleavingStats,
  getRelatedSkills,
} = require('../../utils/interleavingEngine');

describe('Interleaving Engine', () => {

  describe('initializeInterleaving', () => {
    it('should initialize with correct focus skill', () => {
      const state = initializeInterleaving({
        focusSkillId: 'two-step-equations',
        masteredSkills: [
          { skillId: 'one-step-equations-addition', category: 'algebra' },
          { skillId: 'adding-fractions', category: 'fractions' },
        ],
      });

      expect(state.focusSkillId).toBe('two-step-equations');
      expect(state.totalFocused).toBe(0);
      expect(state.totalInterleaved).toBe(0);
    });

    it('should exclude focus skill from candidates', () => {
      const state = initializeInterleaving({
        focusSkillId: 'two-step-equations',
        masteredSkills: [
          { skillId: 'two-step-equations', category: 'algebra' },
          { skillId: 'one-step-equations-addition', category: 'algebra' },
        ],
      });

      const candidateIds = state.candidates.map(c => c.skillId);
      expect(candidateIds).not.toContain('two-step-equations');
    });
  });

  describe('shouldInterleave', () => {
    it('should not interleave too early', () => {
      const state = initializeInterleaving({
        focusSkillId: 'test',
        masteredSkills: [{ skillId: 'other', category: 'algebra' }],
      });

      const result = shouldInterleave(state);
      expect(result.shouldInterleave).toBe(false);
      expect(result.reason).toBe('too-early');
    });

    it('should interleave after enough focused problems', () => {
      let state = initializeInterleaving({
        focusSkillId: 'test',
        masteredSkills: [{ skillId: 'other', category: 'algebra' }],
      });

      // Record enough focused problems
      for (let i = 0; i < 5; i++) {
        state = recordFocusedProblem(state, true);
      }

      const result = shouldInterleave(state);
      expect(result.shouldInterleave).toBe(true);
    });

    it('should not interleave when no candidates', () => {
      let state = initializeInterleaving({
        focusSkillId: 'test',
        masteredSkills: [],
      });

      for (let i = 0; i < 5; i++) {
        state = recordFocusedProblem(state, true);
      }

      const result = shouldInterleave(state);
      expect(result.shouldInterleave).toBe(false);
      expect(result.reason).toBe('no-candidates');
    });

    it('should reduce interleaving when student is struggling', () => {
      let state = initializeInterleaving({
        focusSkillId: 'test',
        masteredSkills: [{ skillId: 'other', category: 'algebra' }],
      });

      // Record focused problems
      for (let i = 0; i < 4; i++) {
        state = recordFocusedProblem(state, true);
      }

      // Struggling student — interval should be longer
      const normalResult = shouldInterleave(state, { recentWrongCount: 0 });
      const strugglingResult = shouldInterleave(state, { recentWrongCount: 4 });

      // With 4 focused problems, normal should be close to interleaving
      // but struggling should not yet (doubled interval)
      expect(strugglingResult.shouldInterleave).toBe(false);
    });
  });

  describe('recordFocusedProblem / recordInterleavedProblem', () => {
    it('should update counters correctly', () => {
      let state = initializeInterleaving({
        focusSkillId: 'test',
        masteredSkills: [{ skillId: 'other', category: 'algebra' }],
      });

      state = recordFocusedProblem(state, true);
      state = recordFocusedProblem(state, false);
      expect(state.totalFocused).toBe(2);
      expect(state.focusedCorrect).toBe(1);

      state = recordInterleavedProblem(state, 'other', true);
      expect(state.totalInterleaved).toBe(1);
      expect(state.interleavedCorrect).toBe(1);
      expect(state.focusedProblemsSinceInterleave).toBe(0); // Reset after interleave
    });
  });

  describe('getInterleavingStats', () => {
    it('should calculate correct statistics', () => {
      let state = initializeInterleaving({
        focusSkillId: 'test',
        masteredSkills: [],
      });

      state = recordFocusedProblem(state, true);
      state = recordFocusedProblem(state, true);
      state = recordFocusedProblem(state, false);
      state.totalInterleaved = 1;
      state.interleavedCorrect = 1;
      state.recentInterleaved = ['other-skill'];

      const stats = getInterleavingStats(state);
      expect(stats.totalProblems).toBe(4);
      expect(stats.focusedAccuracy).toBe(67);
      expect(stats.interleavedAccuracy).toBe(100);
      expect(stats.uniqueSkillsInterleaved).toBe(1);
    });
  });

  describe('getRelatedSkills', () => {
    it('should return skills in same conceptual cluster', () => {
      const related = getRelatedSkills('two-step-equations');
      expect(related).toContain('one-step-equations-addition');
      expect(related).toContain('multi-step-equations');
      expect(related).not.toContain('two-step-equations'); // Not itself
    });

    it('should return empty for unknown skills', () => {
      const related = getRelatedSkills('nonexistent-skill');
      expect(related).toEqual([]);
    });
  });
});
