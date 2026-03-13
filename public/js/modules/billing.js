// modules/billing.js
// Billing status, usage gating, upgrade prompts

import { showToast } from './helpers.js';

/**
 * Check user's billing status (free tier remaining time, pack status)
 */
export async function checkBillingStatus() {
    try {
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
 * Show the upgrade/pricing modal
 */
export function showUpgradePrompt(errorData) {
    const existing = document.getElementById('upgrade-modal');
    if (existing) existing.remove();

    const isFeatureBlock = errorData.premiumFeatureBlocked;
    const title = isFeatureBlock ? `${errorData.feature} Requires Unlimited` : 'Choose a Tutoring Pack';
    const subtitle = isFeatureBlock
        ? `Unlock ${errorData.feature.toLowerCase()}, unlimited 24/7 tutoring, voice, courses, and more.`
        : 'Purchase minutes to continue learning with your AI tutor.<br><span style="font-size:12px;">Minutes only count when the tutor is responding — your reading and thinking time is always free.</span>';

    const packBtnStyle = 'background:#1e1e3a;border:1px solid #444;border-radius:10px;padding:16px;cursor:pointer;text-align:center;color:#fff;transition:border-color 0.2s;';
    const packBtnHover = 'onmouseover="this.style.borderColor=\'#00d4ff\'" onmouseout="this.style.borderColor=\'#444\'"';

    const modal = document.createElement('div');
    modal.id = 'upgrade-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
    modal.innerHTML = `
        <div style="background:#1a1a2e;border-radius:16px;padding:32px;max-width:480px;width:92%;color:#fff;border:1px solid #333;">
            <h2 style="margin:0 0 8px;font-size:22px;text-align:center;">${title}</h2>
            <p style="color:#aaa;margin:0 0 24px;text-align:center;line-height:1.5;">${subtitle}</p>
            <div style="display:flex;flex-direction:column;gap:12px;">
                <div class="pack-option" data-pack="pack_60" style="${packBtnStyle}" ${packBtnHover}>
                    <div style="font-size:20px;font-weight:bold;">60 Minutes</div>
                    <div style="font-size:24px;font-weight:bold;color:#00d4ff;margin:4px 0;">$9.95</div>
                    <div style="color:#888;font-size:12px;">$0.17/min &middot; Expires in 90 days</div>
                </div>
                <div class="pack-option" data-pack="pack_120" style="${packBtnStyle};border-color:#7b2ff7;" ${packBtnHover}>
                    <div style="display:flex;justify-content:center;align-items:center;gap:8px;">
                        <span style="font-size:20px;font-weight:bold;">120 Minutes</span>
                        <span style="background:#7b2ff7;color:#fff;font-size:10px;padding:2px 8px;border-radius:4px;font-weight:bold;">BEST VALUE</span>
                    </div>
                    <div style="font-size:24px;font-weight:bold;color:#00d4ff;margin:4px 0;">$14.95</div>
                    <div style="color:#888;font-size:12px;">$0.12/min &middot; Expires in 180 days</div>
                </div>
                <div class="pack-option" data-pack="unlimited" style="${packBtnStyle}" ${packBtnHover}>
                    <div style="font-size:20px;font-weight:bold;">Unlimited Monthly</div>
                    <div style="font-size:24px;font-weight:bold;color:#00d4ff;margin:4px 0;">$19.95<span style="font-size:14px;color:#aaa;font-weight:normal">/mo</span></div>
                    <div style="color:#888;font-size:12px;">24/7 tutoring, voice, PDF upload, courses, Show My Work &middot; Cancel anytime</div>
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
