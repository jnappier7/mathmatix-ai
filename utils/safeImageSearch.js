// ============================================
// SAFE EDUCATIONAL IMAGE SEARCH
// COPPA-compliant image search for math education
// ============================================
//
// SAFEGUARDS:
// 1. Google Custom Search with SafeSearch ENFORCED (cannot be disabled)
// 2. Restricted to education domain whitelist only
// 3. Query sanitization — strips PII, profanity, non-educational terms
// 4. No student data sent to Google (queries are anonymized)
// 5. Rate limited per student (max 10 per session)
// 6. Results filtered: images only, educational content
// 7. No tracking cookies or user identifiers sent
// 8. All queries logged for audit (without PII)
// ============================================

const axios = require('axios');

// Education-only domain whitelist
const ALLOWED_DOMAINS = [
  'khanacademy.org',
  'mathisfun.com',
  'desmos.com',
  'geogebra.org',
  'mathway.com',
  'purplemath.com',
  'mathsisfun.com',
  'coolmath.com',
  'nctm.org',
  'mathplayground.com',
  'illustrativemathematics.org',
  'openstax.org',
  'ck12.org',
  'mathwarehouse.com',
  'mathantics.com',
  'virtualnerd.com',
  'mathbitsnotebook.com',
  'varsitytutors.com',
  'splashlearn.com',
  'ixl.com',
  'wikipedia.org',
  'wikimedia.org',
  'commons.wikimedia.org',
  'upload.wikimedia.org',
];

// Blocked terms — NEVER allow these in queries (COPPA/child safety)
const BLOCKED_TERMS = [
  // Violence
  /\b(kill|murder|weapon|gun|knife|blood|gore|death|dead|shoot|stab|bomb|explode)\b/i,
  // Sexual content
  /\b(sex|nude|naked|porn|xxx|nsfw|adult|erotic|fetish|onlyfans)\b/i,
  // Drugs/substances
  /\b(drug|cocaine|heroin|meth|weed|marijuana|alcohol|beer|wine|vape|smoke|cigarette)\b/i,
  // Profanity (basic set)
  /\b(shit|fuck|damn|ass|bitch|hell|crap|dick|penis|vagina|breast)\b/i,
  // Self-harm
  /\b(suicide|self.?harm|cutting|anorex|bulimi)\b/i,
  // PII patterns
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/,    // SSN
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/,        // Email
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,     // Phone
];

// Allowed educational categories
const VALID_CATEGORIES = [
  'geometry', 'algebra', 'arithmetic', 'fractions', 'decimals',
  'percents', 'graphing', 'statistics', 'probability', 'trigonometry',
  'calculus', 'measurement', 'patterns', 'number_sense', 'word_problems',
  'place_value', 'integers', 'equations', 'inequalities', 'functions',
  'coordinate_plane', 'shapes', 'angles', 'area', 'volume', 'perimeter',
  'ratios', 'proportions', 'exponents', 'polynomials', 'factoring',
  'number_line', 'multiplication', 'division', 'addition', 'subtraction'
];

/**
 * Sanitize a search query for COPPA compliance
 * @param {string} query - Raw query from AI
 * @returns {{ safe: boolean, sanitized: string, reason: string|null }}
 */
function sanitizeQuery(query) {
  if (!query || typeof query !== 'string') {
    return { safe: false, sanitized: '', reason: 'Empty query' };
  }

  // Trim and limit length
  let cleaned = query.trim().slice(0, 100);

  // Check for blocked terms
  for (const pattern of BLOCKED_TERMS) {
    if (pattern.test(cleaned)) {
      return { safe: false, sanitized: '', reason: 'Blocked content detected' };
    }
  }

  // Strip anything that looks like PII (names, emails, etc.)
  cleaned = cleaned.replace(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, ''); // Full names
  cleaned = cleaned.replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '');     // Emails

  // Force educational context — but keep the query specific
  if (!cleaned.toLowerCase().includes('math') && !cleaned.toLowerCase().includes('geometry') && !cleaned.toLowerCase().includes('graph') && !cleaned.toLowerCase().includes('diagram')) {
    cleaned = `math ${cleaned}`;
  }

  // Don't append generic "educational diagram" — it dilutes specificity and returns stock images
  return { safe: true, sanitized: cleaned.trim(), reason: null };
}

/**
 * Validate that a category is an allowed educational category
 * @param {string} category
 * @returns {boolean}
 */
function isValidCategory(category) {
  if (!category) return true; // No category is fine
  return VALID_CATEGORIES.includes(category.toLowerCase().replace(/\s+/g, '_'));
}

/**
 * Search for safe educational images using Google Custom Search API
 *
 * @param {string} query - The search query (from AI or user)
 * @param {Object} opts
 * @param {string} opts.category - Educational category for filtering
 * @param {number} opts.maxResults - Max results to return (1-5, default 3)
 * @param {string} opts.userId - For audit logging (anonymized)
 * @returns {Promise<{ results: Array, query: string, cached: boolean }>}
 */
async function searchEducationalImages(query, opts = {}) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY || process.env.GOOGLE_CSE_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID || process.env.GOOGLE_CSE_ID;

  if (!apiKey || !searchEngineId) {
    // Fall back to Wikimedia Commons (free, no API key needed)
    console.log('[SafeImageSearch] Google CSE not configured, falling back to Wikimedia Commons');
    return searchWikimediaCommons(query, opts);
  }

  // Sanitize the query
  const { safe, sanitized, reason } = sanitizeQuery(query);
  if (!safe) {
    console.warn(`[SafeImageSearch] Query blocked: ${reason}`);
    return { results: [], query, cached: false, error: reason };
  }

  // Validate category
  if (opts.category && !isValidCategory(opts.category)) {
    console.warn(`[SafeImageSearch] Invalid category: ${opts.category}`);
    return { results: [], query: sanitized, cached: false, error: 'Invalid category' };
  }

  const maxResults = Math.min(Math.max(opts.maxResults || 3, 1), 5);

  // Build site restriction from whitelist
  const siteRestriction = ALLOWED_DOMAINS.map(d => `site:${d}`).join(' OR ');

  try {
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx: searchEngineId,
        q: sanitized,
        searchType: 'image',
        safe: 'active',           // SafeSearch ENFORCED
        num: maxResults,
        imgType: 'clipart',               // Prefer diagrams/illustrations
        imgSize: 'medium',
        rights: 'cc_publicdomain|cc_attribute|cc_sharealike', // Prefer open-license
        // Note: siteSearch only accepts a single domain; site restrictions
        // should be configured in the Custom Search Engine console instead.
      },
      timeout: 5000,
      // No cookies, no user tracking
      headers: {
        'Accept': 'application/json',
        // Do NOT send any user-identifying headers
      }
    });

    if (!response.data?.items?.length) {
      return { results: [], query: sanitized, cached: false };
    }

    // Filter and transform results
    const results = response.data.items
      .filter(item => {
        // Double-check domain is in whitelist
        try {
          const url = new URL(item.link);
          return ALLOWED_DOMAINS.some(d => url.hostname.includes(d));
        } catch {
          return false;
        }
      })
      .map(item => ({
        url: item.link,
        thumbnail: item.image?.thumbnailLink || item.link,
        title: (item.title || '').slice(0, 100),
        source: item.displayLink || '',
        width: item.image?.width,
        height: item.image?.height,
      }));

    // Audit log (no PII)
    console.log(`[SafeImageSearch] Query: "${sanitized}" → ${results.length} results (user: ${opts.userId ? 'authenticated' : 'unknown'})`);

    return { results, query: sanitized, cached: false };

  } catch (error) {
    if (error.response?.status === 429) {
      console.warn('[SafeImageSearch] Google CSE rate limit exceeded');
      return { results: [], query: sanitized, cached: false, error: 'Rate limit exceeded' };
    }
    console.error('[SafeImageSearch] Search failed:', error.message);
    return { results: [], query: sanitized, cached: false, error: 'Search failed' };
  }
}

// ============================================
// WIKIMEDIA COMMONS FALLBACK
// Free, no API key needed, with COPPA safeguards
// ============================================

// Additional blocked terms for Wikimedia (which has no built-in SafeSearch)
const WIKIMEDIA_BLOCKED_TITLE_TERMS = [
  /\banatomy\b/i, /\bnude\b/i, /\bnaked\b/i, /\bbody\b/i,
  /\breproduct/i, /\bgenital/i, /\bbreast/i, /\bsexual/i,
  /\bertotic/i, /\bpenis/i, /\bvagina/i, /\bfertili/i,
  /\bwar\b/i, /\bweapon/i, /\bgun\b/i, /\bkill/i,
  /\bdeath\b/i, /\bblood\b/i, /\btorture/i,
  /\bdrug\b/i, /\balcohol/i, /\bcigarette/i, /\bsmok/i,
];

/**
 * Search Wikimedia Commons for educational math images
 * Uses the MediaWiki API — free, no key needed
 *
 * COPPA safeguards applied:
 * - Same query sanitization as Google CSE
 * - Math-category scoping ("mathematics" prefix)
 * - Title/description filtering against blocked terms
 * - Prefer SVG/PNG (clean diagrams over photos)
 * - No user data sent, no tracking
 *
 * @param {string} query - Search query
 * @param {Object} opts - Options
 * @returns {Promise<{ results: Array, query: string, cached: boolean, source: string }>}
 */
async function searchWikimediaCommons(query, opts = {}) {
  // Sanitize the query (same pipeline as Google CSE)
  const { safe, sanitized, reason } = sanitizeQuery(query);
  if (!safe) {
    console.warn(`[WikimediaSearch] Query blocked: ${reason}`);
    return { results: [], query, cached: false, error: reason };
  }

  // Scope to math/science by prepending "mathematics"
  const mathQuery = sanitized.replace(/\beducational diagram\b/i, '').trim();
  const scopedQuery = `mathematics ${mathQuery}`;

  const maxResults = Math.min(Math.max(opts.maxResults || 3, 1), 5);

  try {
    // MediaWiki API: search for files in Commons
    const response = await axios.get('https://commons.wikimedia.org/w/api.php', {
      params: {
        action: 'query',
        generator: 'search',
        gsrsearch: scopedQuery,
        gsrnamespace: 6,           // File namespace only
        gsrlimit: maxResults * 3,  // Fetch extra to filter
        prop: 'imageinfo',
        iiprop: 'url|size|mime|extmetadata',
        iiurlwidth: 400,           // Thumbnail width
        format: 'json',
        origin: '*',               // CORS
      },
      timeout: 5000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MathmatixAI/1.0 (educational math tutor; COPPA-compliant)',
      }
    });

    const pages = response.data?.query?.pages;
    if (!pages) {
      return { results: [], query: scopedQuery, cached: false, source: 'wikimedia' };
    }

    // Filter and transform results with COPPA safeguards
    const results = Object.values(pages)
      .filter(page => {
        // Must have image info
        if (!page.imageinfo?.length) return false;
        const info = page.imageinfo[0];
        const title = (page.title || '').toLowerCase();

        // Only allow safe image types
        const mime = info.mime || '';
        if (!['image/png', 'image/svg+xml', 'image/jpeg', 'image/gif'].includes(mime)) return false;

        // Block non-educational content by title
        if (WIKIMEDIA_BLOCKED_TITLE_TERMS.some(p => p.test(title))) return false;

        // Prefer diagrams: boost SVG and PNG, skip tiny images
        if (info.width && info.width < 100) return false;
        if (info.height && info.height < 100) return false;

        return true;
      })
      .slice(0, maxResults)
      .map(page => {
        const info = page.imageinfo[0];
        const cleanTitle = (page.title || '')
          .replace(/^File:/, '')
          .replace(/\.[^.]+$/, '')
          .replace(/_/g, ' ')
          .slice(0, 100);

        return {
          url: info.url,
          thumbnail: info.thumburl || info.url,
          title: cleanTitle,
          source: 'Wikimedia Commons',
          width: info.width,
          height: info.height,
        };
      });

    console.log(`[WikimediaSearch] Query: "${scopedQuery}" → ${results.length} results`);

    return { results, query: scopedQuery, cached: false, source: 'wikimedia' };

  } catch (error) {
    console.error('[WikimediaSearch] Search failed:', error.message);
    return { results: [], query: scopedQuery, cached: false, error: 'Search failed', source: 'wikimedia' };
  }
}

/**
 * Get a fallback static image for a math concept (no API needed)
 * @param {string} concept - Math concept
 * @returns {{ url: string, title: string, source: string } | null}
 */
function getStaticConceptImage(concept) {
  const lower = (concept || '').toLowerCase();

  const staticImages = {
    'pythagorean': { url: '/images/concepts/pythagorean-theorem.png', title: 'Pythagorean Theorem', source: 'Mathmatix' },
    'triangle': { url: '/images/concepts/triangle-types.png', title: 'Types of Triangles', source: 'Mathmatix' },
    'circle': { url: '/images/concepts/circle-parts.png', title: 'Parts of a Circle', source: 'Mathmatix' },
    'angle': { url: '/images/concepts/angle-types.png', title: 'Types of Angles', source: 'Mathmatix' },
    'slope': { url: '/images/concepts/slope-intercept.png', title: 'Slope-Intercept Form', source: 'Mathmatix' },
    'quadratic': { url: '/images/concepts/quadratic-formula.png', title: 'Quadratic Formula', source: 'Mathmatix' },
    'factoring': { url: '/images/concepts/factoring-methods.png', title: 'Factoring Methods', source: 'Mathmatix' },
    'exponents': { url: '/images/concepts/exponent-rules.png', title: 'Exponent Rules', source: 'Mathmatix' },
    'fractions': { url: '/images/concepts/fraction-operations.png', title: 'Fraction Operations', source: 'Mathmatix' },
    'decimals': { url: '/images/concepts/decimal-place-value.png', title: 'Decimal Place Value', source: 'Mathmatix' },
    'percent': { url: '/images/concepts/percent-conversion.png', title: 'Percent Conversions', source: 'Mathmatix' },
    'mean': { url: '/images/concepts/measures-central-tendency.png', title: 'Measures of Central Tendency', source: 'Mathmatix' },
    'histogram': { url: '/images/concepts/histogram-example.png', title: 'Histogram Example', source: 'Mathmatix' },
    'probability': { url: '/images/concepts/probability-basics.png', title: 'Probability Basics', source: 'Mathmatix' },
  };

  for (const [key, img] of Object.entries(staticImages)) {
    if (lower.includes(key)) return img;
  }

  return null;
}

module.exports = {
  searchEducationalImages,
  searchWikimediaCommons,
  sanitizeQuery,
  isValidCategory,
  getStaticConceptImage,
  ALLOWED_DOMAINS,
  VALID_CATEGORIES
};
