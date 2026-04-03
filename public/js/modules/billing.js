// modules/billing.js
// Billing status, usage gating, upgrade prompts

import { showToast } from './helpers.js';

/**
 * Check user's billing status (free tier remaining time, pack status)
 */
export async function checkBillingStatus() {
    try {
        // Detect post-payment redirect from Stripe
        handleUpgradeSuccess();

        const res = await csrfFetch('/api/billing/status', { credentials: 'include' });
        if (!res.ok) return null;
        const data = await res.json();

        window._billingStatus = data;

        // Pre-fetch promo data so upgrade modal doesn't flash prices
        if (!window._promoCache) {
            fetch('/api/billing/promo').then(r => r.ok ? r.json() : null).then(p => {
                window._promoCache = p && p.active ? p : { active: false };
            }).catch(() => { window._promoCache = { active: false }; });
        }

        // When billing is off (pre-launch), skip all UI
        if (data.billingEnabled === false) return data;

        // Show "Upgrade Plan" link in nav for free/pack students
        if (data.tier !== 'unlimited') {
            const upgradeLink = document.getElementById('upgrade-plan-link');
            if (upgradeLink) upgradeLink.style.display = '';
        }

        // Show time indicator for students on free/pack tiers only.
        // Teachers, parents, and admins have unlimited access (Infinity) — skip indicator for them.
        if (data.tier !== 'unlimited' && data.usage && data.usage.secondsRemaining !== null && isFinite(data.usage.secondsRemaining)) {
            updateFreeTimeIndicator(data.usage);
        }

        // Post-signup pricing prompt: redirect new free users to pricing page once
        if (data.tier === 'free' && data.hasSeenPricing === false) {
            showNewUserPricingPrompt();
        }

        return data;
    } catch (e) {
        console.error('[Billing] Status check failed:', e.message);
        return null;
    }
}

/**
 * Update the floating time-remaining indicator.
 * Shows AI processing time remaining (not wall-clock time).
 * Time only counts while the AI is generating a response — reading/thinking is free.
 */
export function updateFreeTimeIndicator(usage) {
    let indicator = document.getElementById('free-time-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'free-time-indicator';
        indicator.style.cssText = 'position:fixed;bottom:12px;right:12px;background:#1a1a2e;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;z-index:1750;cursor:pointer;border:1px solid #333;transition:all 0.3s;';
        indicator.title = 'AI processing time only — reading and thinking time is free';
        indicator.addEventListener('click', () => showUpgradePrompt({}));
        document.body.appendChild(indicator);
    }

    const remaining = usage.secondsRemaining || 0;
    const mins = Math.floor(remaining / 60);

    // Calculate human-readable reset time
    let resetText = '';
    if (usage.nextResetAt) {
        const resetDate = new Date(usage.nextResetAt);
        const msUntilReset = resetDate - Date.now();
        if (msUntilReset > 0) {
            const daysUntil = Math.floor(msUntilReset / (1000 * 60 * 60 * 24));
            const hoursUntil = Math.floor((msUntilReset % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            if (daysUntil > 0) {
                resetText = `Resets in ${daysUntil}d ${hoursUntil}h`;
            } else if (hoursUntil > 0) {
                resetText = `Resets in ${hoursUntil}h`;
            } else {
                resetText = 'Resets soon';
            }
        }
    }

    const isMobile = window.innerWidth <= 768;
    const subtitle = isMobile ? '' : '<div style="font-size:10px;color:#888;margin-top:2px;">Only counts when the tutor is responding — your reading time is free</div>';
    const resetLine = resetText ? `<div style="font-size:10px;color:#7b2ff7;margin-top:2px;">${resetText}</div>` : '';

    if (usage.limitReached || remaining <= 0) {
        indicator.innerHTML = '<strong>No AI time left</strong> &mdash; <span style="color:#00d4ff;text-decoration:underline">Get Mathmatix+</span>' + resetLine + subtitle;
        indicator.style.borderColor = '#ff4444';
    } else if (remaining <= 300) {
        indicator.innerHTML = `<strong>${mins} min</strong> AI time left &mdash; <span style="color:#00d4ff;text-decoration:underline">Get Mathmatix+</span>` + resetLine + subtitle;
        indicator.style.borderColor = '#ffaa00';
    } else {
        indicator.innerHTML = `<strong>${mins} min</strong> AI time left` + resetLine + subtitle;
        indicator.style.borderColor = '#333';
    }
}

/**
 * Show the upgrade modal — simplified to Unlimited only (with Pi Day promo support)
 */
export async function showUpgradePrompt(errorData) {
    const existing = document.getElementById('upgrade-modal');
    if (existing) existing.remove();

    // Use pre-cached promo data (fetched at page load) to avoid price flashing
    let promo = null;
    if (window._promoCache && window._promoCache.active) {
        promo = window._promoCache;
    } else {
        try {
            const promoRes = await fetch('/api/billing/promo');
            if (promoRes.ok) {
                const promoData = await promoRes.json();
                if (promoData.active) promo = promoData;
            }
        } catch (_) { /* promo check is best-effort */ }
    }

    const isFeatureBlock = errorData.premiumFeatureBlocked;
    const isLimitReached = errorData.usageLimitReached;
    const title = promo
        ? 'Pi Day Special \u2014 $3.14 Off!'
        : 'Get Mathmatix+';
    const subtitle = isFeatureBlock
        ? `${errorData.feature} requires Mathmatix+.`
        : isLimitReached
        ? "You've used your free minutes this week. Upgrade for unlimited tutoring."
        : 'Unlimited 24/7 tutoring for your child. Cancel anytime.';

    // Price display
    let priceHtml;
    if (promo && promo.prices.unlimited) {
        const promoPrice = (promo.prices.unlimited.promo / 100).toFixed(2);
        priceHtml = `<div style="font-size:16px;color:#888;text-decoration:line-through;">$9.95/mo</div>
                     <div style="font-size:36px;font-weight:bold;color:#00d4ff;margin:4px 0;">$${promoPrice}<span style="font-size:16px;color:#aaa;font-weight:normal">/mo</span></div>
                     <div style="color:#ff6b9d;font-size:12px;font-weight:bold;">Save $3.14 \u2014 Pi Day Special!</div>`;
    } else {
        priceHtml = '<div style="font-size:36px;font-weight:bold;color:#00d4ff;margin:4px 0;">$9.95<span style="font-size:16px;color:#aaa;font-weight:normal">/mo</span></div>';
    }

    const modal = document.createElement('div');
    modal.id = 'upgrade-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
    modal.innerHTML = `
        <div style="background:#1a1a2e;border-radius:16px;padding:32px;max-width:400px;width:92%;color:#fff;border:1px solid ${promo ? '#ff6b9d' : '#333'};text-align:center;">
            <h2 style="margin:0 0 8px;font-size:22px;">${title}</h2>
            <p style="color:#aaa;margin:0 0 20px;line-height:1.5;">${subtitle}</p>
            ${priceHtml}
            <ul style="text-align:left;list-style:none;padding:0;margin:20px 0;color:#ccc;font-size:14px;line-height:2;">
                <li>\u2713 Unlimited 24/7 AI tutoring</li>
                <li>\u2713 Voice chat with your tutor</li>
                <li>\u2713 Unlimited homework uploads</li>
                <li>\u2713 Full course enrollment</li>
                <li>\u2713 Show My Work grading</li>
                <li>\u2713 All features unlocked</li>
            </ul>
            <button id="upgrade-go" style="background:linear-gradient(135deg,#00d4ff,#7b2ff7);color:#fff;border:none;padding:14px 32px;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;width:100%;">Get Mathmatix+</button>
            ${isLimitReached
                ? '<div style="color:#666;font-size:12px;margin-top:12px;">Your free minutes reset weekly. Upgrade for uninterrupted learning.</div>'
                : '<button id="upgrade-dismiss" style="background:transparent;color:#666;border:none;padding:10px;cursor:pointer;font-size:13px;width:100%;margin-top:10px;">Keep free plan (30 min/week)</button>'
            }
        </div>`;
    document.body.appendChild(modal);

    document.getElementById('upgrade-go').addEventListener('click', () => initiateUpgrade('unlimited'));
    const dismissBtn = document.getElementById('upgrade-dismiss');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => modal.remove());
    }
    // Only allow clicking outside to dismiss if it's not a usage limit block
    if (!isLimitReached) {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }
}

/**
 * Redirect to Stripe checkout for a pack upgrade
 */
export async function initiateUpgrade(pack) {
    try {
        const res = await csrfFetch('/api/billing/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pack }),
            credentials: 'include'
        });
        if (!res.ok) throw new Error('Failed to create checkout session');
        const data = await res.json();
        window.location.href = data.url;
    } catch (e) {
        console.error('[Billing] Upgrade error:', e);
        showToast('Something went wrong. Please try again.');
    }
}

/**
 * Show a one-time welcome prompt for new free users, inviting them to see pricing.
 * Displayed as a non-blocking banner at the top of chat, not a full-page redirect.
 */
export function showNewUserPricingPrompt() {
    const existing = document.getElementById('new-user-pricing-banner');
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = 'new-user-pricing-banner';
    banner.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#1a1a2e;border:1px solid #7b2ff7;border-radius:12px;padding:16px 24px;z-index:9500;max-width:440px;width:90%;text-align:center;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,0.4);animation:slideDown 0.3s ease;';
    banner.innerHTML = `
        <div style="font-size:16px;font-weight:600;margin-bottom:6px;">Welcome to Mathmatix!</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:14px;line-height:1.5;">You have <strong style="color:#00d4ff;">30 free minutes</strong> of AI tutoring this week. Want unlimited access?</div>
        <div style="display:flex;gap:10px;justify-content:center;">
            <a href="/pricing.html" style="background:linear-gradient(135deg,#00d4ff,#7b2ff7);color:#fff;border:none;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;">View Plans</a>
            <button id="dismiss-pricing-banner" style="background:transparent;color:#666;border:1px solid #333;padding:8px 16px;border-radius:8px;font-size:13px;cursor:pointer;">Maybe Later</button>
        </div>`;
    document.body.appendChild(banner);

    // Add slide-down animation
    if (!document.getElementById('pricing-banner-anim')) {
        const style = document.createElement('style');
        style.id = 'pricing-banner-anim';
        style.textContent = '@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-20px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}';
        document.head.appendChild(style);
    }

    document.getElementById('dismiss-pricing-banner').addEventListener('click', () => {
        banner.remove();
        // Mark as seen so it doesn't show again
        csrfFetch('/api/billing/seen-pricing', { method: 'POST', credentials: 'include' }).catch(() => {});
    });

    // Don't auto-dismiss — let the user read at their own pace and dismiss manually
}

/**
 * Detect ?upgraded=true in the URL after Stripe checkout redirect.
 * Shows a success banner with confetti, then polls billing status until
 * the Stripe webhook has processed and the user's tier is updated.
 */
function handleUpgradeSuccess() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('upgraded')) return;

    // Clean up the URL so a refresh doesn't re-trigger
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    // Fire confetti
    if (window.ensureConfetti) {
        window.ensureConfetti().then(() => {
            if (window.confetti) {
                window.confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
            }
        });
    }

    // Show success banner
    const banner = document.createElement('div');
    banner.id = 'upgrade-success-banner';
    banner.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#1a1a2e,#0f3460);border:1px solid #00d4ff;border-radius:12px;padding:20px 28px;z-index:9500;max-width:440px;width:90%;text-align:center;color:#fff;box-shadow:0 8px 32px rgba(0,212,255,0.2);animation:slideDown 0.3s ease;';
    banner.innerHTML = `
        <div style="font-size:28px;margin-bottom:8px;">&#127881;</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:6px;">Payment Successful!</div>
        <div id="upgrade-status-text" style="font-size:14px;color:#aaa;line-height:1.5;">Activating your plan...</div>
        <button id="dismiss-upgrade-banner" style="background:transparent;color:#666;border:none;padding:8px;cursor:pointer;font-size:13px;margin-top:10px;">Dismiss</button>`;
    document.body.appendChild(banner);

    // Add slide-down animation if not already present
    if (!document.getElementById('pricing-banner-anim')) {
        const style = document.createElement('style');
        style.id = 'pricing-banner-anim';
        style.textContent = '@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-20px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}';
        document.head.appendChild(style);
    }

    document.getElementById('dismiss-upgrade-banner').addEventListener('click', () => banner.remove());

    // Poll billing status until webhook processes (tier changes from 'free')
    pollForUpgrade();
}

/**
 * Poll /api/billing/status after payment until the tier reflects the purchase.
 * Stripe webhooks typically arrive within 1-5 seconds, but can be delayed.
 * Polls at 1s, 2s, 3s, 5s, 8s (max 5 attempts) then gives up gracefully.
 */
async function pollForUpgrade() {
    const delays = [1000, 2000, 3000, 5000, 8000];
    const statusText = document.getElementById('upgrade-status-text');
    const banner = document.getElementById('upgrade-success-banner');

    for (let i = 0; i < delays.length; i++) {
        await new Promise(r => setTimeout(r, delays[i]));
        try {
            const res = await csrfFetch('/api/billing/status', { credentials: 'include' });
            if (!res.ok) continue;
            const data = await res.json();

            if (data.tier && data.tier !== 'free') {
                // Webhook processed — update UI
                window._billingStatus = data;

                if (statusText) {
                    const tierLabel = 'Mathmatix+';
                    statusText.textContent = `Your ${tierLabel} plan is now active. Start chatting with your AI tutor!`;
                }

                // Update the time indicator and hide upgrade link
                if (data.tier === 'unlimited') {
                    const indicator = document.getElementById('free-time-indicator');
                    if (indicator) indicator.remove();
                    const upgradeLink = document.getElementById('upgrade-plan-link');
                    if (upgradeLink) upgradeLink.style.display = 'none';
                } else if (data.usage) {
                    updateFreeTimeIndicator(data.usage);
                }

                // Auto-dismiss banner after 6 seconds
                setTimeout(() => {
                    if (banner && banner.parentNode) {
                        banner.style.transition = 'opacity 0.3s';
                        banner.style.opacity = '0';
                        setTimeout(() => banner.remove(), 300);
                    }
                }, 6000);
                return;
            }
        } catch (_) { /* retry */ }
    }

    // Webhook didn't arrive in time — show fallback message
    if (statusText) {
        statusText.textContent = 'Your plan is being activated. It may take a moment — try refreshing the page.';
    }
    setTimeout(() => {
        if (banner && banner.parentNode) {
            banner.style.transition = 'opacity 0.3s';
            banner.style.opacity = '0';
            setTimeout(() => banner.remove(), 300);
        }
    }, 8000);
}
