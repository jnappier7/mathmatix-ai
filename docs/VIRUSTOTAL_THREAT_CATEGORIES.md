# VirusTotal Vendor Threat Categories — mathmatix.ai

**Last checked:** March 5, 2026
**Status:** FALSE POSITIVES — mathmatix.ai is a legitimate K-12 math education platform

---

## Current Vendor Detections

### Flagging as Phishing (6 vendors)

| Vendor | Category | Notes |
|---|---|---|
| alphaMountain.ai | Phishing | AI-based URL classifier; likely triggered by redirect patterns |
| BitDefender | Phishing | Major AV vendor; feeds G-Data and others |
| Fortinet | Phishing | Enterprise security; uses FortiGuard URL database |
| G-Data | Phishing | Uses BitDefender engine — will clear when BitDefender clears |
| Lionic | Phishing | Taiwan-based vendor; smaller footprint |
| Sophos | Phishing / Phishing and Fraud | Enterprise AV; has own URL reputation DB |

### Flagging as Malicious (3 vendors)

| Vendor | Category | Notes |
|---|---|---|
| ADMINUSLabs | Malicious | DNS/URL reputation service |
| Bfore.Ai PreCrime | Malicious | AI-based predictive threat intelligence |
| Webroot | Malicious / Phishing and Other Frauds | BrightCloud URL categorization |

### Other Classifications (1 vendor)

| Vendor | Category | Notes |
|---|---|---|
| Forcepoint ThreatSeeker | Other AI/ML Applications | Not flagging as malicious — just categorizing the site as an AI application |

---

## Root Cause Analysis

### Why vendors are flagging mathmatix.ai

1. **New domain / low reputation** — Newer domains with limited browsing history get lower trust scores from reputation engines.

2. **Previous redirect patterns** (fixed in commit `815f929`):
   - Open redirect in teacher resources endpoint
   - Error messages passed as URL query parameters mimicked phishing redirect chains
   - HTTP-to-HTTPS redirect wasn't enforced cleanly

3. **AI/education content patterns** — Some heuristic scanners flag sites with:
   - AI chat interfaces (looks like social engineering)
   - Login pages on newer domains
   - OAuth redirect flows (Google/Microsoft sign-in)

4. **BitDefender cascade effect** — BitDefender's detection propagates to G-Data (and potentially other vendors that license BitDefender's engine).

---

## Remediation Steps

### Already Completed

- [x] Fixed open redirect vulnerability in `routes/teacherResources.js`
- [x] Removed verbose error messages from email verification redirect URLs
- [x] Added HTTPS enforcement middleware
- [x] Added security headers via Helmet
- [x] Added `/.well-known/security.txt`

### Pending Actions

- [ ] **Submit false positive reports** to each vendor (see links below)
- [ ] **Request site review** on VirusTotal after submitting reports
- [ ] **Add DNS-based domain verification** (DMARC, SPF, DKIM records)
- [ ] **Improve domain reputation** — ensure Google Safe Browsing is clean
- [ ] **Monitor detections** — run automated checks weekly

### False Positive Report Links

| Vendor | Report URL |
|---|---|
| BitDefender | https://www.bitdefender.com/consumer/support/answer/29358/ |
| Fortinet | https://www.fortiguard.com/faq/wfratingsubmit |
| Sophos | https://support.sophos.com/support/s/article/KB-000036275 |
| Webroot | https://www.brightcloud.com/tools/change-request-url-background.php |
| Forcepoint | https://csi.forcepoint.com/ |
| G-Data | Will auto-clear when BitDefender clears (shared engine) |
| alphaMountain.ai | https://www.alphamountain.ai/contact |
| ADMINUSLabs | https://www.adminuslabs.net/ |
| Bfore.Ai | https://bfrore.ai — contact via support |
| Lionic | https://www.lionic.com/ — contact via support |

---

## Detection History

| Date | Detections | Notes |
|---|---|---|
| 2026-03-04 | 9/95 vendors | Initial detection; open redirect + error params |
| 2026-03-04 | — | Fix deployed: commit `815f929` |
| 2026-03-05 | 9+ vendors | Vendors still caching old results; false positive reports needed |

---

## Monitoring

An automated check script is available at `scripts/check-virustotal.js`.

```bash
# Check current VirusTotal status (requires VIRUSTOTAL_API_KEY env var)
node scripts/check-virustotal.js

# Or add to package.json scripts:
npm run check:virustotal
```
