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

        // Show time indicator for students on free/pack tiers only.
        // Teachers, parents, and admins have unlimited access (Infinity) — skip indicator for them.
        if (data.tier !== 'unlimited' && data.usage && data.usage.secondsRemaining !== null && isFinite(data.usage.secondsRemaining)) {
            updateFreeTimeIndicator(data.usage);
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

    const subtitle = '<div style="font-size:10px;color:#888;margin-top:2px;">Only counts when the tutor is responding — your reading time is free</div>';

    if (usage.limitReached || remaining <= 0) {
        indicator.innerHTML = '<strong>No AI time left</strong> &mdash; <span style="color:#00d4ff;text-decoration:underline">Buy Pack</span>' + subtitle;
        indicator.style.borderColor = '#ff4444';
    } else if (remaining <= 300) {
        indicator.innerHTML = `<strong>${mins} min</strong> AI time left &mdash; <span style="color:#00d4ff;text-decoration:underline">Buy More</span>` + subtitle;
        indicator.style.borderColor = '#ffaa00';
    } else {
        indicator.innerHTML = `<strong>${mins} min</strong> AI time left` + subtitle;
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
