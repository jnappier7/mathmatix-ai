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

        // Show time indicator for pack users and free users
        if (data.tier !== 'unlimited' && data.usage) {
            updateFreeTimeIndicator(data.usage);
        }

        return data;
    } catch (e) {
        console.error('[Billing] Status check failed:', e.message);
        return null;
    }
}

/**
 * Update the floating time-remaining indicator
 */
export function updateFreeTimeIndicator(usage) {
    let indicator = document.getElementById('free-time-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'free-time-indicator';
        indicator.style.cssText = 'position:fixed;bottom:12px;right:12px;background:#1a1a2e;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;z-index:9000;cursor:pointer;border:1px solid #333;transition:all 0.3s;';
        indicator.addEventListener('click', () => showUpgradePrompt({}));
        document.body.appendChild(indicator);
    }

    const remaining = usage.secondsRemaining || 0;
    const mins = Math.floor(remaining / 60);

    if (usage.limitReached || remaining <= 0) {
        indicator.innerHTML = '<strong>No time left</strong> &mdash; <span style="color:#00d4ff;text-decoration:underline">Buy Pack</span>';
        indicator.style.borderColor = '#ff4444';
    } else if (remaining <= 300) {
        indicator.innerHTML = `<strong>${mins} min</strong> left &mdash; <span style="color:#00d4ff;text-decoration:underline">Buy More</span>`;
        indicator.style.borderColor = '#ffaa00';
    } else {
        indicator.innerHTML = `<strong>${mins} min</strong> remaining`;
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
        ? `Unlock ${errorData.feature.toLowerCase()}, unlimited tutoring, voice, and more.`
        : 'Purchase minutes to continue learning with your AI tutor.';

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
                    <div style="color:#888;font-size:12px;">Unlimited tutoring + voice + uploads &middot; Cancel anytime</div>
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
