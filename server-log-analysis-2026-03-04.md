# Server Log Analysis — March 4, 2026 (03:40–03:49 UTC)

## Executive Summary

Analysis of ~10 minutes of production server logs from mathmatix.ai reveals **2 real user sessions**, **heavy Facebook/Instagram bot crawling**, a **server redeployment**, and several actionable issues around missing metadata, oversized assets, and environment configuration.

---

## 1. Timeline of Events

| Time (UTC) | Event |
|---|---|
| 03:40:37 | User 1 lands on site (Android, via Facebook in-app browser) |
| 03:40:37–39 | User 1 loads all landing page assets (CSS, images, JS) |
| 03:40:54–03:46:17 | Facebook crawler repeatedly requests `/meta.json` → **404** |
| 03:44:11 | Facebook crawler fetches landing page with Facebook ad UTM params |
| 03:44:18 | ChatGPT bot crawls homepage |
| 03:47:54 | User 2 lands on site (iPhone, via Instagram ad) |
| 03:47:54–03:48:00 | User 2 loads all landing page assets |
| 03:48:16 | **Deployment triggered** |
| 03:48:54 | Server process starts |
| 03:48:57 | MongoDB connected, CAT cache warmed |
| 03:49:00 | Service live at mathmatix.ai |

---

## 2. Traffic Breakdown

### Real Users (2 sessions)

**User 1 — Android / Facebook In-App Browser**
- **Device:** Samsung Galaxy A14 5G (SM-A146U), Android 15
- **Source:** Facebook in-app browser (`FB_IAB/FB4A`)
- **IP:** 172.56.113.56 (T-Mobile cellular)
- **Assets loaded:** ~20 resources (CSS, JS, images)
- **Concern:** Two very large responses — **14.6 MB** (979ms) and **22.2 MB** (240ms) — likely unoptimized PNG images

**User 2 — iPhone / Instagram Ad**
- **Device:** iPhone 13 Pro Max (iPhone14,3), iOS 18.7
- **Source:** Instagram ad (utm_source=ig, campaign ID 120242661126740332)
- **IP:** 172.59.215.7
- **Assets loaded:** ~20 resources (CSS, JS, images)
- **Concern:** One response of **13.6 MB** took **4,810ms** — nearly 5 seconds for a single asset on a mobile connection

### Bots

| Bot | Requests | Notable |
|---|---|---|
| Facebook crawler (`facebookexternalhit/1.1`) | ~20+ requests | Repeated `/meta.json` → 404 |
| ChatGPT bot (`ChatGPT-User/1.0`) | 2 requests | Crawled homepage, got 200 |

---

## 3. Issues Found

### CRITICAL: `/meta.json` returns 404

**Impact:** Facebook's link preview crawler requests `/meta.json` on every crawl and gets a 404. This was observed **8+ times** in a 10-minute window. While Facebook primarily relies on Open Graph `<meta>` tags in HTML for link previews, the repeated 404s generate unnecessary error noise and may indicate Facebook is looking for structured app metadata.

**Affected requests:**
- 03:40:54, 03:41:57, 03:42:26, 03:42:30, 03:42:37, 03:42:54, 03:43:57, 03:45:11

**Recommendation:** Either create a `/meta.json` file with basic app metadata or add a route that returns a minimal JSON response to silence these 404s.

---

### HIGH: Oversized image assets on mobile

Several image responses are far too large for mobile users on cellular connections:

| Asset (estimated) | Size | Response Time | User |
|---|---|---|---|
| Large image | 22.2 MB | 240ms | User 1 (Android) |
| Large image | 14.6 MB | 979ms | User 1 (Android) |
| Large image | 13.6 MB | 4,810ms | User 2 (iPhone) |
| Image (homeworkMom.png) | ~0.5 MB | 797ms | User 1 |
| Image (tabletBoy.png) | ~0.17 MB | 173ms | User 1 |

The landing page is transferring **~40+ MB of images** to mobile users. This causes:
- Slow initial page load (especially on cellular)
- High data usage for users
- Poor Core Web Vitals (LCP)

**Recommendation:**
- Convert PNG images to WebP/AVIF format (typically 50-80% size reduction)
- Implement responsive images with `srcset` for different screen sizes
- Lazy-load below-the-fold images
- Consider serving optimized versions via a CDN image transformation service

---

### MEDIUM: Environment set to "development" in production

```
"environment": "development"
```

The server logs show `environment: "development"` on a production deployment. This may cause:
- Verbose error messages exposed to users
- Debug-level logging generating excess log volume
- Console-only logging (no file rotation) based on the logger configuration
- Potentially relaxed security settings

**Recommendation:** Set `NODE_ENV=production` in the Render environment variables.

---

### MEDIUM: No Redis configured — in-memory cache only

```
[ContextCache] No REDIS_URL configured, using in-memory cache
```

The CAT (Computerized Adaptive Testing) cache and context cache are using in-memory storage. This means:
- Cache is lost on every deployment or server restart (which happened during this window)
- Cache cannot be shared across multiple server instances if scaling horizontally
- The warmup process runs on every restart (~4 seconds)

**Recommendation:** Configure a Redis instance (Render offers managed Redis) for persistent caching.

---

### MEDIUM: No S3 configured — local disk storage

```
📁 [Cloud Storage] S3 not configured — using local disk storage
```

On Render's ephemeral filesystem, uploaded files will be lost on every deploy. Any student file uploads or generated content stored locally will disappear.

**Recommendation:** Configure AWS S3 (or compatible service) for persistent file storage.

---

### LOW: Mongoose warnings

1. **Reserved pathname `errors`:** A schema is using `errors` as a field name, which conflicts with Mongoose internals. This could cause subtle bugs.

2. **Duplicate index on `courseId`:** The Course model defines `courseId` with both `index: true` in the field definition and a separate `schema.index()` call, creating redundant indexes that waste storage and slow writes.

**Recommendation:**
- Rename the `errors` field or pass `suppressReservedKeysWarning` as a schema option
- Remove the redundant `index: true` from the `courseId` field definition in `models/course.js` since the compound index already covers it

---

## 4. Performance Summary

### Response Times (static assets)
- CSS files: **1-5ms** (excellent)
- Small images: **2-8ms** (excellent)
- Large PNGs: **100-800ms** (needs optimization)
- Very large assets: **979-4810ms** (critical)

### Server Startup Time
- Process start to "live": **~6 seconds** (03:48:54 → 03:49:00)
- MongoDB connection: **~3 seconds** after start
- CAT cache warmup: **~1 second** (240 skills, 223 problem counts, 22 template difficulties)

---

## 5. Traffic Source Analysis

Both real users arrived through **paid social media ads**:
- User 1: Facebook ad (FB in-app browser)
- User 2: Instagram ad (campaign `120242661126740332`)

This indicates active paid acquisition. The oversized image problem is particularly important because:
- Ad-driven traffic is **paid per click** — slow loads waste ad spend through bounce
- Social media in-app browsers are often slower than native browsers
- Mobile cellular connections are bandwidth-constrained

---

## 6. Recommended Action Items

| Priority | Action | Impact |
|---|---|---|
| Critical | Optimize landing page images (WebP, lazy loading, responsive) | Reduce 40+ MB page weight, improve mobile load times |
| High | Create `/meta.json` or suppress 404 | Clean up logs, improve Facebook integration |
| High | Set `NODE_ENV=production` | Proper logging, security, error handling |
| Medium | Configure Redis for caching | Persistent cache across deploys |
| Medium | Configure S3 for file storage | Persistent uploads across deploys |
| Low | Fix Mongoose duplicate index warning | Cleaner startup, marginally less DB overhead |
| Low | Address Mongoose reserved pathname warning | Prevent potential subtle bugs |
