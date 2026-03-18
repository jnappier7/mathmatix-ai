# Site Traffic & Analytics Guide

## Overview

Mathmatix AI uses two analytics systems working together:

| System | ID | Purpose |
|--------|------|---------|
| Google Tag Manager (GTM) | `GTM-WDF79L47` | Container that manages all tracking tags |
| Google Analytics 4 (GA4) | `G-EMX730XF5H` | Collects page views, events, and user behavior |

## How It Works

### Google Tag Manager (GTM)
- Inline snippet in every HTML `<head>` (lines 4–10)
- Noscript fallback iframe in `<body>` for non-JS users
- Acts as a "container" — you can add/remove tags (GA4, Facebook Pixel, etc.) from the GTM web UI without touching code

### Google Analytics 4 (GA4) — Direct Integration
- Loaded via `/public/js/analytics.js`
- Measurement ID is set on each HTML page via `data-ga="G-EMX730XF5H"` attribute
- Automatically tracks: page views, scrolls, outbound clicks, site search, video engagement, file downloads

### Custom Events Tracked (in `analytics.js`)
| Event | Trigger | Details |
|-------|---------|---------|
| `sign_up` | Signup form submit | `method: 'email'` |
| `click` (CTA) | Signup/pricing link clicks | `event_category: 'CTA'` |
| `click` (try_demo) | Demo button clicks | `event_label: 'try_demo'` |

### Facebook Pixel
- Also loaded via `analytics.js` using the `data-fbp` attribute
- Currently not configured (attribute is empty)
- To enable: add your Pixel ID to `data-fbp=""` on each HTML page

## Files That Include Analytics

These files have the `analytics.js` script tag with the GA4 Measurement ID:

- `public/index.html`
- `public/login.html`
- `public/signup.html`
- `public/pricing.html`

## Where to View Your Data

1. **Google Analytics**: https://analytics.google.com → Select the Mathmatix AI property
2. **Google Tag Manager**: https://tagmanager.google.com → Container `GTM-WDF79L47`

## Key Reports to Monitor

### Realtime (verify setup)
Analytics → Reports → Realtime — visit your site and confirm you see yourself

### Acquisition
- **Traffic acquisition**: See where visitors come from (Google, direct, social, referral)
- **User acquisition**: First-touch attribution for new users

### Engagement
- **Pages and screens**: Which pages get the most views
- **Events**: Custom events (sign_up, CTA clicks, demo clicks)
- **Conversions**: Mark `sign_up` as a conversion in GA4 Admin → Events

### Retention
- **Retention overview**: How many users return after their first visit

## GTM vs Direct GA4: Why Both?

- **GTM** gives you flexibility to add marketing tags (Google Ads, Facebook, etc.) without code deploys
- **Direct GA4 via analytics.js** ensures core tracking works even if GTM is blocked by ad blockers
- They complement each other — GTM can fire additional GA4 events or manage consent

## Adding New Events

To track a new user action, add it to `public/js/analytics.js`:

```javascript
// Example: track when a user starts a tutoring session
gtag('event', 'start_session', {
  event_category: 'Tutoring',
  event_label: 'math_session'
});
```

Then mark it as a conversion in GA4 if it's a key business event.

## Troubleshooting

1. **No data showing up?**
   - Visit your site and check Realtime report
   - Open browser DevTools → Network tab → filter for "gtag" or "analytics"
   - Check for ad blockers that might block the scripts

2. **GTM tag not detected?**
   - Install the [Tag Assistant](https://tagassistant.google.com/) Chrome extension
   - Visit your site and verify both GTM and GA4 tags fire

3. **CSP blocking scripts?**
   - The server's Content Security Policy (in `server.js`) already allows `googletagmanager.com`
   - If you add new third-party scripts, update the CSP directives in `server.js`
