# Anthropic API Cost Separation Guide

## Problem

When using the same Anthropic API key for both:
1. **Personal development** (Claude Code CLI, testing, debugging)
2. **Production traffic** (live student interactions)

You face several challenges:
- ❌ Cannot track costs separately
- ❌ Development work consumes production budget
- ❌ Difficult to set appropriate spending limits
- ❌ No visibility into which usage is driving costs

## Solution: Environment-Specific API Keys

We've implemented automatic API key selection based on `NODE_ENV`:

```
┌─────────────────────────────────────────────────────┐
│  NODE_ENV=development                                │
│  Uses: ANTHROPIC_API_KEY_DEV                        │
│  Purpose: Testing, Claude Code, local dev           │
│  Budget: Lower limit (e.g., $50/month)              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  NODE_ENV=production                                 │
│  Uses: ANTHROPIC_API_KEY_PROD                       │
│  Purpose: Live student traffic                      │
│  Budget: Higher limit (e.g., $500/month)            │
└─────────────────────────────────────────────────────┘
```

---

## Setup Instructions

### Step 1: Create Separate Projects in Anthropic Console

1. Go to [https://console.anthropic.com](https://console.anthropic.com)
2. Create two projects:

   **Project 1: mathmatix-ai-production**
   - Click "Create Project"
   - Name: `mathmatix-ai-production`
   - Set spending limit: Your main budget (e.g., $500/month)
   - Generate API key → Copy as `ANTHROPIC_API_KEY_PROD`

   **Project 2: mathmatix-ai-development**
   - Click "Create Project"
   - Name: `mathmatix-ai-development`
   - Set spending limit: Lower limit (e.g., $50/month)
   - Generate API key → Copy as `ANTHROPIC_API_KEY_DEV`

### Step 2: Update Your `.env` Files

**Local Development (`.env`):**
```bash
NODE_ENV=development
ANTHROPIC_API_KEY_DEV=sk-ant-api03-YOUR_DEV_KEY_HERE
ANTHROPIC_API_KEY_PROD=sk-ant-api03-YOUR_PROD_KEY_HERE  # Optional for local
```

**Production Server (`.env` or environment variables):**
```bash
NODE_ENV=production
ANTHROPIC_API_KEY_PROD=sk-ant-api03-YOUR_PROD_KEY_HERE
# ANTHROPIC_API_KEY_DEV not needed in production
```

### Step 3: Verify Configuration

Start your server and check the logs:

```bash
npm start
```

You should see:
```
✅ [Init] Anthropic client initialized successfully (DEVELOPMENT mode using ANTHROPIC_API_KEY_DEV)
✅ Anthropic API key configured for DEVELOPMENT environment
```

Or in production:
```
✅ [Init] Anthropic client initialized successfully (PRODUCTION mode using ANTHROPIC_API_KEY_PROD)
✅ Anthropic API key configured for PRODUCTION environment
```

---

## Cost Tracking & Monitoring

### 1. Anthropic Console Dashboard

Monitor usage separately for each project:
- **Development Project**: [https://console.anthropic.com/settings/usage](https://console.anthropic.com/settings/usage)
  - Shows: Claude Code usage, testing, debugging
- **Production Project**: [https://console.anthropic.com/settings/usage](https://console.anthropic.com/settings/usage)
  - Shows: Live student interactions only

### 2. Set Up Spending Alerts

For each project:
1. Go to Settings → Billing → Spending Limits
2. Set alert thresholds:
   - **Development**: Alert at 80% of $50 = $40
   - **Production**: Alert at 80% of $500 = $400

### 3. Monthly Cost Review

Track these metrics monthly:

| Metric | Development | Production |
|--------|-------------|------------|
| Total API Calls | | |
| Total Tokens Used | | |
| Total Cost | | |
| Cost per User (Prod) | N/A | |
| Cost per Session (Prod) | N/A | |

---

## Migration Path (If Using Legacy Key)

If you currently have `ANTHROPIC_API_KEY` set:

### Option A: Keep Legacy Key for Now (Backward Compatible)
```bash
# .env
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_CURRENT_KEY
# Server will use this as fallback and warn you to migrate
```

### Option B: Migrate Immediately (Recommended)
1. Create two new projects (see Step 1 above)
2. Update `.env`:
   ```bash
   ANTHROPIC_API_KEY_DEV=sk-ant-api03-NEW_DEV_KEY
   ANTHROPIC_API_KEY_PROD=sk-ant-api03-NEW_PROD_KEY
   # Remove or comment out ANTHROPIC_API_KEY
   ```
3. Test locally to ensure dev key works
4. Deploy to production with prod key

---

## How It Works (Technical Details)

### Code Changes

**File: `utils/openaiClient.js`**
```javascript
const isProduction = process.env.NODE_ENV === 'production';

const anthropicApiKey = isProduction
    ? process.env.ANTHROPIC_API_KEY_PROD    // Production
    : process.env.ANTHROPIC_API_KEY_DEV     // Development
    || process.env.ANTHROPIC_API_KEY;       // Legacy fallback

const anthropic = new Anthropic({ apiKey: anthropicApiKey });
```

**File: `server.js`**
- Validates appropriate key exists for current environment
- Warns if using legacy key
- Logs which key is being used (without exposing the key value)

### Environment Detection

| Context | `NODE_ENV` | Key Used |
|---------|------------|----------|
| Local development | `development` | `ANTHROPIC_API_KEY_DEV` |
| Staging server | `staging` or `development` | `ANTHROPIC_API_KEY_DEV` |
| Production server | `production` | `ANTHROPIC_API_KEY_PROD` |
| Claude Code CLI | `development` (default) | `ANTHROPIC_API_KEY_DEV` |

---

## Cost Optimization Tips

### 1. Use Development Key for All Testing
```bash
# When running tests, migrations, or scripts
NODE_ENV=development npm test
NODE_ENV=development npm run migrate
```

### 2. Monitor Token Usage
Add logging to track expensive requests:
```javascript
// In utils/openaiClient.js (already implemented)
console.log(`LOG: Calling primary model (${model})`);
```

### 3. Set Up Rate Limiting Per Environment
```javascript
// Development: Generous limits for testing
const devLimits = { max: 1000, windowMs: 60000 };

// Production: Conservative limits to control costs
const prodLimits = { max: 150, windowMs: 60000 };
```

### 4. Cache Frequent Requests
Consider caching AI responses for:
- Identical math problems
- Common help topics
- Curriculum content generation

---

## Troubleshooting

### Issue: "No Anthropic API key found"

**Cause**: Neither environment-specific nor legacy key is set

**Solution**:
```bash
# Check your .env file
cat .env | grep ANTHROPIC

# Should see either:
ANTHROPIC_API_KEY_DEV=sk-ant-...
# OR
ANTHROPIC_API_KEY=sk-ant-...  # Legacy
```

### Issue: "Using legacy ANTHROPIC_API_KEY (deprecated)"

**Not an error**, but a warning. Your app works fine, but you should migrate:

1. Create separate projects in Anthropic Console
2. Add new keys to `.env`
3. Remove or comment out `ANTHROPIC_API_KEY`

### Issue: Production using development key

**Cause**: `NODE_ENV` not set to `production`

**Solution**:
```bash
# On your production server
export NODE_ENV=production
# OR in .env
NODE_ENV=production
```

### Issue: High costs on development key

**Cause**: Running production traffic in development mode

**Solution**:
```bash
# Ensure production server has:
NODE_ENV=production
ANTHROPIC_API_KEY_PROD=sk-ant-api03-YOUR_PROD_KEY
```

---

## FAQ

**Q: Can I use the same key for both environments?**
A: Yes, the legacy `ANTHROPIC_API_KEY` works as a fallback, but you lose cost separation benefits.

**Q: What if I only have one Anthropic project?**
A: Create a second project for free in the Anthropic Console. There's no cost to have multiple projects.

**Q: Does this affect Claude Code CLI usage?**
A: Yes! Claude Code runs with `NODE_ENV=development` by default, so it will use your `ANTHROPIC_API_KEY_DEV` key, separating your coding costs from production user costs.

**Q: How do I test production configuration locally?**
A: Set `NODE_ENV=production` temporarily:
```bash
NODE_ENV=production npm start
```

**Q: Will this break existing deployments?**
A: No. The code falls back to `ANTHROPIC_API_KEY` if environment-specific keys aren't found. Migrate when ready.

---

## Cost Benchmarks (Rough Estimates)

**Claude 3.5 Sonnet Pricing** (as of Jan 2025):
- Input: $3 per million tokens
- Output: $15 per million tokens

**Typical Usage:**

| Activity | Tokens | Cost |
|----------|--------|------|
| Student chat message (1 exchange) | ~500 input + 1000 output | ~$0.017 |
| Homework grading (with image) | ~1000 input + 500 output | ~$0.011 |
| Claude Code session (1 hour) | ~10,000 input + 5000 output | ~$0.105 |

**Monthly Estimates:**
- **100 students**, 10 interactions/day each = ~30,000 interactions/month = **~$510/month**
- **Developer using Claude Code**, 20 hours/month = ~20 sessions = **~$2/month**

By separating keys, you can clearly see these distinct cost patterns.

---

## Next Steps

1. ✅ Create separate Anthropic projects
2. ✅ Update `.env` with environment-specific keys
3. ✅ Test locally with development key
4. ✅ Deploy to production with production key
5. ✅ Set up spending alerts in Anthropic Console
6. ✅ Monitor usage weekly for the first month
7. ✅ Adjust limits as needed based on actual usage

For questions or issues, consult the Anthropic documentation:
- [API Keys & Projects](https://docs.anthropic.com/en/api/getting-started)
- [Cost & Usage Tracking](https://console.anthropic.com/settings/billing)
