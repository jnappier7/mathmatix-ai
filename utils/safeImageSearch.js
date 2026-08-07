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
const fs = require('fs');
const path = require('path');

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

  // Enforce the education whitelist at SEARCH time via q-operators. The dedicated
  // siteSearch param only accepts ONE domain, so we fold the whitelist into q as
  // `(site:a OR site:b ...)`. This keeps results inside the whitelist instead of
  // relying solely on the CSE console config, and ensures the post-filter below
  // has whitelisted results to keep rather than silently emptying the board.
  const siteRestriction = ALLOWED_DOMAINS.map(d => `site:${d}`).join(' OR ');

  try {
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx: searchEngineId,
        q: `${sanitized} (${siteRestriction})`,
        searchType: 'image',
        safe: 'active',           // SafeSearch ENFORCED (child safety) — never disabled
        num: maxResults,
        // imgType is intentionally NOT pinned to 'clipart' — that dropped most
        // legitimate math diagrams/figures and was a top cause of empty boards.
        // Safety stays enforced by SafeSearch + the domain whitelist + the
        // open-license filter below.
        imgSize: 'medium',
        rights: 'cc_publicdomain|cc_attribute|cc_sharealike', // open-license only (IP compliance)
      },
      timeout: 5000,
      // No cookies, no user tracking
      headers: {
        'Accept': 'application/json',
        // Do NOT send any user-identifying headers
      }
    });

    if (!response.data?.items?.length) {
      // Zero raw hits deserves the same Wikimedia fallback as zero *filtered*
      // hits below — the board already promised a visual either way.
      console.log('[SafeImageSearch] CSE returned no items; falling back to Wikimedia Commons');
      return searchWikimediaCommons(query, opts);
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

    // If the whitelist/license filters emptied the CSE results, fall back to
    // Wikimedia Commons (in-whitelist, CC-licensed, own safety filters) so the
    // board isn't left blank after the tutor promised a visual.
    if (results.length === 0) {
      console.log('[SafeImageSearch] CSE returned no whitelisted results; falling back to Wikimedia Commons');
      return searchWikimediaCommons(query, opts);
    }

    return { results, query: sanitized, cached: false };

  } catch (error) {
    // A CSE quota/outage should degrade to the compliant Wikimedia source,
    // not blank the board.
    if (error.response?.status === 429) {
      console.warn('[SafeImageSearch] Google CSE rate limit exceeded; falling back to Wikimedia Commons');
    } else {
      console.error('[SafeImageSearch] Search failed:', error.message, '— falling back to Wikimedia Commons');
    }
    return searchWikimediaCommons(query, opts);
  }
}

// ============================================
// WIKIMEDIA COMMONS FALLBACK
// Free, no API key needed, with COPPA safeguards
// ============================================

// Presentation words describe the PICTURE the tutor wants, not the math in it.
// Commons full-text search ANDs every term against file pages, so a query like
// "exterior angle of a triangle labeled diagram straight line" matches nothing
// while "exterior angle of a triangle" returns nine perfect diagrams. These are
// safe to strip when relaxing; content words ("number line", "straight line" as
// a topic) are deliberately NOT here — relaxation drops trailing words instead.
const PRESENTATION_WORDS = /\b(labell?ed|diagram|diagrams|picture|pictures|image|images|illustration|illustrations|example|examples|figure|figures|visual|visuals|showing|shown|clearly|simple|basic|drawing|drawings|photo|photos)\b/gi;

/**
 * Ordered search-query variants, most specific first: the query as given, then
 * with presentation words stripped, then progressively dropping trailing words
 * (never below minWords, so the leading math-scope term survives).
 * @param {string} q
 * @param {{max?: number, minWords?: number}} [opts]
 * @returns {string[]}
 */
function relaxedQueryVariants(q, { max = 4, minWords = 3 } = {}) {
  const out = [];
  const push = (s) => {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (s && !out.includes(s)) out.push(s);
  };
  push(q);
  const stripped = String(q || '').replace(PRESENTATION_WORDS, ' ');
  push(stripped);
  let words = stripped.replace(/\s+/g, ' ').trim().split(' ');
  while (words.length > minWords && out.length < max) {
    words = words.slice(0, -1);
    push(words.join(' '));
  }
  return out.slice(0, max);
}

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

  // Scope to math/science — but don't stack a second prefix on top of the
  // "math" that sanitizeQuery already guarantees. "mathematics math X" ranks
  // scanned PDF textbooks above diagrams, and a PDF in the generator results
  // makes the thumbnailer 400 the ENTIRE API call (urlparamnormal), so the
  // fallback returned nothing at all. filetype:bitmap|drawing keeps results
  // to renderable images and keeps PDFs out of the generator entirely.
  const mathQuery = sanitized.replace(/\beducational diagram\b/i, '').trim();
  const scoped = /\bmath/i.test(mathQuery) ? mathQuery : `mathematics ${mathQuery}`;

  const maxResults = Math.min(Math.max(opts.maxResults || 3, 1), 5);

  // Runs ONE Commons query; returns the filtered results, or null on error.
  async function runCommonsQuery(gsrsearch) {
    const response = await axios.get('https://commons.wikimedia.org/w/api.php', {
      params: {
        action: 'query',
        generator: 'search',
        gsrsearch,
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
    if (!pages) return [];

    // Filter and transform results with COPPA safeguards
    return Object.values(pages)
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
  }

  // Tutor-generated queries pack in presentation words ("… labeled diagram
  // straight line") that Commons ANDs against file pages — the full query often
  // matches nothing while its core noun phrase has plenty of diagrams. Try the
  // most specific variant first and relax until something renders.
  let lastError = false;
  for (const variant of relaxedQueryVariants(scoped)) {
    try {
      const results = await runCommonsQuery(`${variant} filetype:bitmap|drawing`);
      console.log(`[WikimediaSearch] Query: "${variant}" → ${results.length} results`);
      if (results.length) {
        return { results, query: variant, cached: false, source: 'wikimedia' };
      }
      lastError = false;
    } catch (error) {
      console.error('[WikimediaSearch] Search failed:', error.message);
      lastError = true;
    }
  }

  return {
    results: [], query: scoped, cached: false, source: 'wikimedia',
    ...(lastError ? { error: 'Search failed' } : {})
  };
}

// The static map below is aspirational — the files under public/images/concepts/
// are not all shipped (at one point NONE were, and because the route consults this
// map BEFORE any real search, every query containing "angle"/"triangle"/etc.
// short-circuited to a 404 and the board showed "Couldn't load that picture").
// Only ever return an entry whose file actually exists on disk.
const conceptImageExists = new Map(); // url → boolean, cached for the process lifetime
function staticImageOnDisk(url) {
  if (!conceptImageExists.has(url)) {
    conceptImageExists.set(url, fs.existsSync(path.join(__dirname, '..', 'public', ...url.split('/').filter(Boolean))));
  }
  return conceptImageExists.get(url);
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
    if (lower.includes(key) && staticImageOnDisk(img.url)) return img;
  }

  return null;
}

// Hosts we'll proxy image BYTES from (see the /proxy route in routes/imageSearch.js).
// Superset of ALLOWED_DOMAINS plus the thumbnail CDNs the search results point at
// (Google CSE thumbnails live on gstatic; some cached copies on googleusercontent).
const PROXYABLE_IMAGE_HOSTS = ALLOWED_DOMAINS.concat(['gstatic.com', 'googleusercontent.com']);

/**
 * Whether a URL is safe for the server-side image proxy to fetch. Defends the
 * proxy against SSRF: only http(s), never an obvious internal host, and the
 * hostname must match (or be a subdomain of) a known educational / thumbnail
 * host. Relative URLs (our own /images/...) return false — the client serves
 * those directly and never needs the proxy.
 * @param {string} raw
 * @returns {boolean}
 */
function isProxyableImageUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch (_) { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  // Belt-and-suspenders against the allowlist below: refuse obvious internal names.
  if (/^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.|::1|\[)/.test(host)) return false;
  return PROXYABLE_IMAGE_HOSTS.some(d => host === d || host.endsWith('.' + d));
}

module.exports = {
  searchEducationalImages,
  searchWikimediaCommons,
  relaxedQueryVariants,
  sanitizeQuery,
  isValidCategory,
  getStaticConceptImage,
  isProxyableImageUrl,
  ALLOWED_DOMAINS,
  VALID_CATEGORIES
};
