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
        indicator.style.cssText = 'position:fixed;bottom:12px;right:12px;background:#1a1a2e;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;z-index:9000;cursor:pointer;border:1px solid #333;transition:all 0.3s;';
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

    const subtitle = '<div style="font-size:10px;color:#888;margin-top:2px;">Only counts when the tutor is responding — your reading time is free</div>';
    const resetLine = resetText ? `<div style="font-size:10px;color:#7b2ff7;margin-top:2px;">${resetText}</div>` : '';

    if (usage.limitReached || remaining <= 0) {
        indicator.innerHTML = '<strong>No AI time left</strong> &mdash; <span style="color:#00d4ff;text-decoration:underline">Buy Pack</span>' + resetLine + subtitle;
        indicator.style.borderColor = '#ff4444';
    } else if (remaining <= 300) {
        indicator.innerHTML = `<strong>${mins} min</strong> AI time left &mdash; <span style="color:#00d4ff;text-decoration:underline">Buy More</span>` + resetLine + subtitle;
        indicator.style.borderColor = '#ffaa00';
    } else {
        indicator.innerHTML = `<strong>${mins} min</strong> AI time left` + resetLine + subtitle;
        indicator.style.borderColor = '#333';
    }
}

/**
 * Show the upgrade/pricing modal (with Pi Day promo support)
 */
export async function showUpgradePrompt(errorData) {
    const existing = document.getElementById('upgrade-modal');
    if (existing) existing.remove();

    // Check for active Pi Day promo
    let promo = null;
    try {
        const promoRes = await fetch('/api/billing/promo');
        if (promoRes.ok) {
            const promoData = await promoRes.json();
            if (promoData.active) promo = promoData;
        }
    } catch (_) { /* promo check is best-effort */ }

    const isFeatureBlock = errorData.premiumFeatureBlocked;
    const title = promo
        ? 'Pi Day Launch Special — $3.14 Off!'
        : isFeatureBlock ? `${errorData.feature} Requires Unlimited` : 'Choose a Tutoring Pack';
    const subtitle = promo
        ? 'Celebrate Pi Day with $3.14 off any plan. Limited time only!'
        : isFeatureBlock
            ? `Unlock ${errorData.feature.toLowerCase()}, unlimited 24/7 tutoring, voice, courses, and more.`
            : 'Purchase minutes to continue learning with your AI tutor.';

    const packBtnStyle = 'background:#1e1e3a;border:1px solid #444;border-radius:10px;padding:16px;cursor:pointer;text-align:center;color:#fff;transition:border-color 0.2s;';
    const packBtnHover = 'onmouseover="this.style.borderColor=\'#00d4ff\'" onmouseout="this.style.borderColor=\'#444\'"';

    function formatPrice(pack, originalCents, label, perMin, extra) {
        if (promo && promo.prices[pack]) {
            const promoCents = promo.prices[pack].promo;
            const promoPrice = (promoCents / 100).toFixed(2);
            const originalPrice = (originalCents / 100).toFixed(2);
            return `<div style="font-size:14px;color:#888;text-decoration:line-through;margin-bottom:2px;">$${originalPrice}${label}</div>
                    <div style="font-size:24px;font-weight:bold;color:#00d4ff;margin:4px 0;">$${promoPrice}${label}</div>
                    <div style="color:#ff6b9d;font-size:11px;font-weight:bold;margin-bottom:4px;">Save $3.14 — Pi Day Special!</div>
                    <div style="color:#888;font-size:12px;">${extra}</div>`;
        }
        const price = (originalCents / 100).toFixed(2);
        return `<div style="font-size:24px;font-weight:bold;color:#00d4ff;margin:4px 0;">$${price}${label}</div>
                <div style="color:#888;font-size:12px;">${extra}</div>`;
    }

    const promoBadge = promo ? '<div style="background:linear-gradient(135deg,#ff6b9d,#c850c0);color:#fff;font-size:11px;padding:4px 12px;border-radius:20px;font-weight:bold;text-align:center;margin-bottom:16px;">Limited Time — Ends March 15!</div>' : '';

    const modal = document.createElement('div');
    modal.id = 'upgrade-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
    modal.innerHTML = `
        <div style="background:#1a1a2e;border-radius:16px;padding:32px;max-width:480px;width:92%;color:#fff;border:1px solid ${promo ? '#ff6b9d' : '#333'};">
            <h2 style="margin:0 0 8px;font-size:22px;text-align:center;">${title}</h2>
            <p style="color:#aaa;margin:0 0 16px;text-align:center;line-height:1.5;">${subtitle}</p>
            ${promoBadge}
            <div style="display:flex;flex-direction:column;gap:12px;">
                <div class="pack-option" data-pack="pack_60" style="${packBtnStyle}" ${packBtnHover}>
                    <div style="font-size:20px;font-weight:bold;">60 Minutes</div>
                    ${formatPrice('pack_60', 995, '', '$0.17/min', '$0.17/min \u00b7 Expires in 90 days')}
                </div>
                <div class="pack-option" data-pack="pack_120" style="${packBtnStyle};border-color:#7b2ff7;" ${packBtnHover}>
                    <div style="display:flex;justify-content:center;align-items:center;gap:8px;">
                        <span style="font-size:20px;font-weight:bold;">120 Minutes</span>
                        <span style="background:#7b2ff7;color:#fff;font-size:10px;padding:2px 8px;border-radius:4px;font-weight:bold;">BEST VALUE</span>
                    </div>
                    ${formatPrice('pack_120', 1495, '', '$0.12/min', '$0.12/min \u00b7 Expires in 180 days')}
                </div>
                <div class="pack-option" data-pack="unlimited" style="${packBtnStyle}" ${packBtnHover}>
                    <div style="font-size:20px;font-weight:bold;">Unlimited Monthly</div>
                    ${formatPrice('unlimited', 1995, '<span style="font-size:14px;color:#aaa;font-weight:normal">/mo</span>', '', '24/7 tutoring, voice, PDF upload, courses, Show My Work \u00b7 Cancel anytime')}
                </div>
            </div>
            <button id="upgrade-dismiss" style="background:transparent;color:#666;border:none;padding:10px;cursor:pointer;font-size:13px;width:100%;margin-top:16px;">Maybe later</button>
        </div>`;
    document.body.appendChild(modal);

    modal.querySelectorAll('.pack-option').forEach(btn => {
        btn.addEventListener('click', () => initiateUpgrade(btn.dataset.pack));
    });
    document.getElementById('upgrade-dismiss').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
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
        <div style="font-size:13px;color:#aaa;margin-bottom:14px;line-height:1.5;">You have <strong style="color:#00d4ff;">10 free minutes</strong> of AI tutoring this week. Want to unlock more?</div>
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

    // Auto-dismiss after 15 seconds
    setTimeout(() => {
        if (banner.parentNode) {
            banner.style.transition = 'opacity 0.3s';
            banner.style.opacity = '0';
            setTimeout(() => banner.remove(), 300);
            csrfFetch('/api/billing/seen-pricing', { method: 'POST', credentials: 'include' }).catch(() => {});
        }
    }, 15000);
}

/**
 * Detect ?upgraded=true in the URL after Stripe checkout redirect.
 * Shows a success banner with confetti and cleans up the URL.
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
        <div style="font-size:14px;color:#aaa;line-height:1.5;">Your plan is now active. Start chatting with your AI tutor!</div>
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

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
        if (banner.parentNode) {
            banner.style.transition = 'opacity 0.3s';
            banner.style.opacity = '0';
            setTimeout(() => banner.remove(), 300);
        }
    }, 8000);
}
