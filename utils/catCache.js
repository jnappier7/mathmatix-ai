/**
 * CAT CACHING MODULE
 *
 * In-memory cache for skill and problem data to reduce database queries.
 * Skills and problem counts change infrequently, so caching is effective.
 *
 * CACHE STRATEGY:
 * - Skills: Refresh every 5 minutes
 * - Problem counts: Refresh every 5 minutes
 * - Template difficulties: Static (loaded once)
 *
 * @module catCache
 */

const Skill = require('../models/skill');
const Problem = require('../models/problem');

// ===========================================================================
// CACHE CONFIGURATION
// ===========================================================================

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// ===========================================================================
// CACHE STATE
// ===========================================================================

let skillCache = {
  data: null,
  timestamp: 0,
  loading: false,
};

let problemCountCache = {
  data: null,
  timestamp: 0,
  loading: false,
};

let templateDifficultyCache = {
  data: null,
  loaded: false,
};

let availableSkillIdsCache = {
  data: null,
  timestamp: 0,
};

// ===========================================================================
// SKILL CACHE
// ===========================================================================

/**
 * Get all skills from cache or database
 *
 * @returns {Promise<Array>} Array of skill objects
 */
async function getSkills() {
  const now = Date.now();

  // Return cached data if still valid
  if (skillCache.data && (now - skillCache.timestamp) < CACHE_TTL) {
    return skillCache.data;
  }

  // Prevent concurrent fetches
  if (skillCache.loading) {
    // Wait for current fetch to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    return getSkills();
  }

  skillCache.loading = true;

  try {
    const skills = await Skill.find({})
      .select('skillId name category irtDifficulty')
      .lean();

    skillCache.data = skills;
    skillCache.timestamp = now;

    console.log(`[CAT Cache] Loaded ${skills.length} skills`);

    return skills;
  } catch (error) {
    console.error('[CAT Cache] Error loading skills:', error);
    // Return stale data if available
    return skillCache.data || [];
  } finally {
    skillCache.loading = false;
  }
}

/**
 * Get a single skill by ID
 *
 * @param {String} skillId - Skill ID to find
 * @returns {Promise<Object|null>} Skill object or null
 */
async function getSkillById(skillId) {
  const skills = await getSkills();
  return skills.find(s => s.skillId === skillId) || null;
}

/**
 * Get skills filtered by category
 *
 * @param {String} category - Category to filter by
 * @returns {Promise<Array>} Filtered skills
 */
async function getSkillsByCategory(category) {
  const skills = await getSkills();
  return skills.filter(s => s.category === category);
}

// ===========================================================================
// PROBLEM COUNT CACHE
// ===========================================================================

/**
 * Get problem counts per skill
 *
 * @returns {Promise<Map>} Map of skillId -> problem count
 */
async function getProblemCounts() {
  const now = Date.now();

  // Return cached data if still valid
  if (problemCountCache.data && (now - problemCountCache.timestamp) < CACHE_TTL) {
    return problemCountCache.data;
  }

  // Prevent concurrent fetches
  if (problemCountCache.loading) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return getProblemCounts();
  }

  problemCountCache.loading = true;

  try {
    const counts = await Problem.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$skillId', count: { $sum: 1 } } },
    ]);

    const countMap = new Map(counts.map(p => [p._id, p.count]));
    problemCountCache.data = countMap;
    problemCountCache.timestamp = now;

    console.log(`[CAT Cache] Loaded problem counts for ${countMap.size} skills`);

    return countMap;
  } catch (error) {
    console.error('[CAT Cache] Error loading problem counts:', error);
    return problemCountCache.data || new Map();
  } finally {
    problemCountCache.loading = false;
  }
}

/**
 * Get problem count for a specific skill
 *
 * @param {String} skillId - Skill ID
 * @returns {Promise<Number>} Problem count
 */
async function getProblemCountForSkill(skillId) {
  const counts = await getProblemCounts();
  return counts.get(skillId) || 0;
}

// ===========================================================================
// TEMPLATE DIFFICULTY CACHE
// ===========================================================================

/**
 * Load template difficulties (static, one-time load)
 *
 * @returns {Object} Map of skillId -> baseDifficulty
 */
function loadTemplateDifficulties() {
  if (templateDifficultyCache.loaded) {
    return templateDifficultyCache.data;
  }

  try {
    const { TEMPLATES } = require('./problemGenerator');
    const difficultyMap = {};

    for (const template of Object.values(TEMPLATES)) {
      if (template.skillId && template.baseDifficulty !== undefined) {
        difficultyMap[template.skillId] = template.baseDifficulty;
      }
    }

    templateDifficultyCache.data = difficultyMap;
    templateDifficultyCache.loaded = true;

    console.log(`[CAT Cache] Loaded ${Object.keys(difficultyMap).length} template difficulties`);

    return difficultyMap;
  } catch (error) {
    console.error('[CAT Cache] Error loading template difficulties:', error);
    return {};
  }
}

/**
 * Get template difficulty for a skill
 *
 * @param {String} skillId - Skill ID
 * @returns {Number|null} Template difficulty or null
 */
function getTemplateDifficulty(skillId) {
  const difficulties = loadTemplateDifficulties();
  return difficulties[skillId] || null;
}

// ===========================================================================
// AVAILABLE SKILLS CACHE
// ===========================================================================

/**
 * Get set of skill IDs that have problems or templates available
 *
 * @returns {Promise<Set>} Set of available skill IDs
 */
async function getAvailableSkillIds() {
  const now = Date.now();

  // Return cached data if still valid
  if (availableSkillIdsCache.data && (now - availableSkillIdsCache.timestamp) < CACHE_TTL) {
    return availableSkillIdsCache.data;
  }

  try {
    // Get skills with problems
    const skillsWithProblems = await Problem.distinct('skillId');

    // Get skills with templates
    const templateDifficulties = loadTemplateDifficulties();
    const templateSkillIds = Object.keys(templateDifficulties);

    // Combine
    const available = new Set([...skillsWithProblems, ...templateSkillIds]);

    availableSkillIdsCache.data = available;
    availableSkillIdsCache.timestamp = now;

    console.log(`[CAT Cache] ${available.size} skills available (${skillsWithProblems.length} with problems, ${templateSkillIds.length} with templates)`);

    return available;
  } catch (error) {
    console.error('[CAT Cache] Error loading available skills:', error);
    return availableSkillIdsCache.data || new Set();
  }
}

/**
 * Check if a skill has problems or templates available
 *
 * @param {String} skillId - Skill ID
 * @returns {Promise<Boolean>}
 */
async function isSkillAvailable(skillId) {
  const available = await getAvailableSkillIds();
  return available.has(skillId);
}

// ===========================================================================
// COMBINED QUERIES
// ===========================================================================

/**
 * Get all data needed for skill selection in one call
 *
 * @returns {Promise<Object>} { skills, problemCounts, templateDifficulties, availableSkillIds }
 */
async function getSkillSelectionData() {
  const [skills, problemCounts, availableSkillIds] = await Promise.all([
    getSkills(),
    getProblemCounts(),
    getAvailableSkillIds(),
  ]);

  const templateDifficulties = loadTemplateDifficulties();

  // Filter skills to only available ones
  const filteredSkills = skills.filter(s => availableSkillIds.has(s.skillId));

  return {
    skills: filteredSkills,
    problemCounts,
    templateDifficulties,
    availableSkillIds,
  };
}

// ===========================================================================
// CACHE MANAGEMENT
// ===========================================================================

/**
 * Clear all caches
 */
function clearCache() {
  skillCache = { data: null, timestamp: 0, loading: false };
  problemCountCache = { data: null, timestamp: 0, loading: false };
  availableSkillIdsCache = { data: null, timestamp: 0 };
  // Don't clear template cache - it's static

  console.log('[CAT Cache] Cache cleared');
}

/**
 * Invalidate specific cache
 *
 * @param {String} cacheName - 'skills' | 'problems' | 'available' | 'all'
 */
function invalidateCache(cacheName) {
  switch (cacheName) {
    case 'skills':
      skillCache.timestamp = 0;
      break;
    case 'problems':
      problemCountCache.timestamp = 0;
      break;
    case 'available':
      availableSkillIdsCache.timestamp = 0;
      break;
    case 'all':
      clearCache();
      break;
  }
}

/**
 * Get cache statistics
 *
 * @returns {Object} Cache stats
 */
function getCacheStats() {
  const now = Date.now();

  return {
    skills: {
      count: skillCache.data?.length || 0,
      age: skillCache.timestamp ? now - skillCache.timestamp : null,
      valid: skillCache.data && (now - skillCache.timestamp) < CACHE_TTL,
    },
    problemCounts: {
      count: problemCountCache.data?.size || 0,
      age: problemCountCache.timestamp ? now - problemCountCache.timestamp : null,
      valid: problemCountCache.data && (now - problemCountCache.timestamp) < CACHE_TTL,
    },
    templateDifficulties: {
      count: Object.keys(templateDifficultyCache.data || {}).length,
      loaded: templateDifficultyCache.loaded,
    },
    availableSkills: {
      count: availableSkillIdsCache.data?.size || 0,
      age: availableSkillIdsCache.timestamp ? now - availableSkillIdsCache.timestamp : null,
    },
  };
}

// ===========================================================================
// WARMUP
// ===========================================================================

/**
 * Pre-load all caches (call on server startup)
 */
async function warmupCache() {
  console.log('[CAT Cache] Warming up...');

  try {
    await Promise.all([
      getSkills(),
      getProblemCounts(),
      getAvailableSkillIds(),
    ]);
    loadTemplateDifficulties();

    console.log('[CAT Cache] Warmup complete');
    console.log('[CAT Cache] Stats:', getCacheStats());
  } catch (error) {
    console.error('[CAT Cache] Warmup failed:', error);
  }
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
  // Skill queries
  getSkills,
  getSkillById,
  getSkillsByCategory,

  // Problem queries
  getProblemCounts,
  getProblemCountForSkill,

  // Template queries
  loadTemplateDifficulties,
  getTemplateDifficulty,

  // Availability
  getAvailableSkillIds,
  isSkillAvailable,

  // Combined
  getSkillSelectionData,

  // Management
  clearCache,
  invalidateCache,
  getCacheStats,
  warmupCache,

  // Constants
  CACHE_TTL,
};
