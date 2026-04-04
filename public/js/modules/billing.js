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

        // Show "Manage Subscription" link for subscribed users
        if (data.tier === 'unlimited') {
            const manageLink = document.getElementById('manage-subscription-link');
            if (manageLink) manageLink.style.display = '';
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
 * Show the subscription management modal (cancel, reactivate, or go to Stripe portal).
 * Accessible from the hamburger menu for subscribed users.
 */
export async function showManageSubscription() {
    const existing = document.getElementById('manage-sub-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'manage-sub-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
    modal.innerHTML = `
        <div style="background:#1a1a2e;border-radius:16px;padding:32px;max-width:440px;width:92%;color:#fff;border:1px solid #333;text-align:center;">
            <h2 style="margin:0 0 8px;font-size:20px;">Manage Subscription</h2>
            <p style="color:#888;margin:0 0 20px;font-size:14px;">Loading your subscription details...</p>
            <div id="manage-sub-content" style="min-height:100px;display:flex;align-items:center;justify-content:center;">
                <i class="fas fa-spinner fa-spin" style="font-size:24px;color:#7b2ff7;"></i>
            </div>
            <button id="manage-sub-close" style="background:transparent;color:#666;border:none;padding:10px;cursor:pointer;font-size:13px;width:100%;margin-top:10px;">Close</button>
        </div>`;
    document.body.appendChild(modal);

    document.getElementById('manage-sub-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    try {
        const res = await csrfFetch('/api/billing/subscription-details', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        const content = document.getElementById('manage-sub-content');
        if (!content) return;

        if (!data.hasSubscription) {
            content.innerHTML = `
                <div style="text-align:center;">
                    <p style="color:#aaa;margin-bottom:16px;">You don't have an active subscription.</p>
                    <a href="/pricing.html" style="background:linear-gradient(135deg,#00d4ff,#7b2ff7);color:#fff;border:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block;">View Plans</a>
                </div>`;
            return;
        }

        const periodEnd = data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null;
        const periodEndStr = periodEnd ? periodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A';

        // Support link used across all states
        const supportLink = '<a href="/contact-support.html" style="color:#00d4ff;text-decoration:underline;font-size:12px;" target="_blank"><i class="fas fa-life-ring"></i> Having an issue? Contact support instead</a>';

        if (data.isPaused) {
            // Subscription is paused — show resume option
            const resumeDate = data.resumesAt ? new Date(data.resumesAt) : null;
            const resumeDateStr = resumeDate ? resumeDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A';
            content.innerHTML = `
                <div style="text-align:left;">
                    <div style="background:#1a1a2a;border:1px solid #ffaa00;border-radius:10px;padding:16px;margin-bottom:16px;">
                        <div style="font-size:14px;color:#ffaa00;font-weight:600;margin-bottom:4px;"><i class="fas fa-pause-circle"></i> Subscription Paused</div>
                        <div style="font-size:13px;color:#aaa;">Your subscription is paused. Billing resumes automatically on <strong style="color:#fff;">${resumeDateStr}</strong>.</div>
                        <div style="font-size:13px;color:#aaa;margin-top:4px;">You still have access to free-tier features (30 min/week) while paused.</div>
                    </div>
                    <button id="manage-sub-resume" style="background:linear-gradient(135deg,#00d4ff,#7b2ff7);color:#fff;border:none;padding:14px 24px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;width:100%;margin-bottom:10px;"><i class="fas fa-play"></i> Resume Now</button>
                    <p style="color:#666;font-size:12px;text-align:center;">Resume early to get unlimited tutoring back immediately.</p>
                    <div style="text-align:center;margin-top:12px;">${supportLink}</div>
                </div>`;
            document.getElementById('manage-sub-resume').addEventListener('click', async (e) => {
                e.target.disabled = true;
                e.target.textContent = 'Resuming...';
                try {
                    const r = await csrfFetch('/api/billing/resume', { method: 'POST', credentials: 'include' });
                    if (r.ok) {
                        showToast('Subscription resumed! Unlimited tutoring is back.');
                        modal.remove();
                        checkBillingStatus();
                    } else {
                        const d = await r.json();
                        showToast(d.message || 'Failed to resume.');
                        e.target.disabled = false;
                        e.target.innerHTML = '<i class="fas fa-play"></i> Resume Now';
                    }
                } catch { showToast('Something went wrong.'); e.target.disabled = false; e.target.innerHTML = '<i class="fas fa-play"></i> Resume Now'; }
            });
        } else if (data.cancelAtPeriodEnd) {
            // Subscription is set to cancel — show reactivation option
            content.innerHTML = `
                <div style="text-align:left;">
                    <div style="background:#2a1a1a;border:1px solid #ff6b6b;border-radius:10px;padding:16px;margin-bottom:16px;">
                        <div style="font-size:14px;color:#ff6b6b;font-weight:600;margin-bottom:4px;"><i class="fas fa-exclamation-triangle"></i> Cancellation Scheduled</div>
                        <div style="font-size:13px;color:#aaa;">Your Mathmatix+ access ends on <strong style="color:#fff;">${periodEndStr}</strong>. You'll revert to the free plan after that date.</div>
                    </div>
                    <button id="manage-sub-reactivate" style="background:linear-gradient(135deg,#00d4ff,#7b2ff7);color:#fff;border:none;padding:14px 24px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;width:100%;margin-bottom:10px;"><i class="fas fa-undo"></i> Keep My Subscription</button>
                    <p style="color:#666;font-size:12px;text-align:center;">Changed your mind? Reactivate to keep unlimited tutoring.</p>
                    <div style="text-align:center;margin-top:12px;">${supportLink}</div>
                </div>`;
            document.getElementById('manage-sub-reactivate').addEventListener('click', async (e) => {
                e.target.disabled = true;
                e.target.textContent = 'Reactivating...';
                try {
                    const r = await csrfFetch('/api/billing/reactivate', { method: 'POST', credentials: 'include' });
                    const d = await r.json();
                    if (r.ok) {
                        showToast('Subscription reactivated!');
                        modal.remove();
                        checkBillingStatus();
                    } else {
                        showToast(d.message || 'Failed to reactivate.');
                        e.target.disabled = false;
                        e.target.textContent = 'Keep My Subscription';
                    }
                } catch { showToast('Something went wrong.'); e.target.disabled = false; e.target.textContent = 'Keep My Subscription'; }
            });
        } else {
            // Active subscription — show pause, cancel, and portal options
            content.innerHTML = `
                <div style="text-align:left;">
                    <div style="background:#1a2a1a;border:1px solid #4caf50;border-radius:10px;padding:16px;margin-bottom:16px;">
                        <div style="font-size:14px;color:#4caf50;font-weight:600;margin-bottom:4px;"><i class="fas fa-check-circle"></i> Mathmatix+ Active</div>
                        <div style="font-size:13px;color:#aaa;">Next billing date: <strong style="color:#fff;">${periodEndStr}</strong></div>
                        <div style="font-size:13px;color:#aaa;">Plan: <strong style="color:#fff;">$9.95/month</strong></div>
                    </div>

                    <!-- Pause Option -->
                    <div style="background:#0f0f23;border:1px solid #333;border-radius:10px;padding:16px;margin-bottom:16px;">
                        <div style="font-size:14px;color:#ffaa00;font-weight:600;margin-bottom:8px;"><i class="fas fa-pause-circle"></i> Need a Break?</div>
                        <p style="color:#aaa;font-size:13px;margin:0 0 10px;line-height:1.5;">Pause your subscription instead of cancelling. No charges while paused, and your child's progress is saved.</p>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button class="manage-sub-pause-btn" data-months="1" style="flex:1;background:#1a1a2e;color:#ffaa00;border:1px solid #ffaa00;padding:10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">1 Month</button>
                            <button class="manage-sub-pause-btn" data-months="2" style="flex:1;background:#1a1a2e;color:#ffaa00;border:1px solid #ffaa00;padding:10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">2 Months</button>
                            <button class="manage-sub-pause-btn" data-months="3" style="flex:1;background:#1a1a2e;color:#ffaa00;border:1px solid #ffaa00;padding:10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">3 Months</button>
                        </div>
                    </div>

                    <hr style="border:none;border-top:1px solid #333;margin:16px 0;">

                    <!-- Cancel Option -->
                    <div style="margin-bottom:16px;">
                        <label style="font-size:13px;color:#aaa;display:block;margin-bottom:6px;">Reason for cancelling (optional):</label>
                        <select id="cancel-reason-select" style="width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#0f0f23;color:#fff;font-size:13px;">
                            <option value="">Select a reason...</option>
                            <option value="too_expensive">Too expensive right now</option>
                            <option value="not_using">Not using it enough</option>
                            <option value="seasonal_break">Taking a break (summer, travel, etc.)</option>
                            <option value="switching">Switching to another service</option>
                            <option value="child_doesnt_like">My child doesn't want to use it</option>
                            <option value="technical_issues">Technical issues</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <button id="manage-sub-cancel" style="background:#ff4444;color:#fff;border:none;padding:14px 24px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;width:100%;margin-bottom:10px;">Cancel Subscription</button>
                    <p style="color:#666;font-size:12px;text-align:center;">You'll keep access until ${periodEndStr}. No further charges.</p>

                    <hr style="border:none;border-top:1px solid #333;margin:16px 0;">
                    <div style="display:flex;gap:10px;flex-wrap:wrap;">
                        <button id="manage-sub-portal" style="flex:1;background:transparent;color:#00d4ff;border:1px solid #333;padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer;"><i class="fas fa-external-link-alt"></i> Billing Portal</button>
                        <a href="/contact-support.html" target="_blank" style="flex:1;background:transparent;color:#aaa;border:1px solid #333;padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer;text-decoration:none;text-align:center;display:flex;align-items:center;justify-content:center;gap:4px;"><i class="fas fa-life-ring"></i> Get Help</a>
                    </div>
                </div>`;

            // Pause button handlers
            document.querySelectorAll('.manage-sub-pause-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const months = parseInt(e.target.dataset.months);
                    if (!confirm(`Pause your subscription for ${months} month${months > 1 ? 's' : ''}? Billing will resume automatically after that.`)) return;
                    e.target.disabled = true;
                    e.target.textContent = 'Pausing...';
                    try {
                        const r = await csrfFetch('/api/billing/pause', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ months }),
                            credentials: 'include'
                        });
                        const d = await r.json();
                        if (r.ok) {
                            showToast(d.message || 'Subscription paused!');
                            modal.remove();
                            checkBillingStatus();
                        } else {
                            showToast(d.message || 'Failed to pause.');
                            e.target.disabled = false;
                            e.target.textContent = `${months} Month${months > 1 ? 's' : ''}`;
                        }
                    } catch { showToast('Something went wrong.'); e.target.disabled = false; e.target.textContent = `${months} Month${months > 1 ? 's' : ''}`; }
                });
            });

            document.getElementById('manage-sub-cancel').addEventListener('click', async (e) => {
                const reason = document.getElementById('cancel-reason-select').value;
                if (!confirm('Are you sure you want to cancel? You will keep access until ' + periodEndStr + '.')) return;
                e.target.disabled = true;
                e.target.textContent = 'Cancelling...';
                try {
                    const r = await csrfFetch('/api/billing/cancel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reason }),
                        credentials: 'include'
                    });
                    const d = await r.json();
                    if (r.ok) {
                        showToast('Subscription cancelled. You have access until ' + periodEndStr + '. Check your email for confirmation.');
                        modal.remove();
                        checkBillingStatus();
                    } else {
                        showToast(d.message || 'Failed to cancel.');
                        e.target.disabled = false;
                        e.target.textContent = 'Cancel Subscription';
                    }
                } catch { showToast('Something went wrong.'); e.target.disabled = false; e.target.textContent = 'Cancel Subscription'; }
            });

            document.getElementById('manage-sub-portal').addEventListener('click', async () => {
                try {
                    const r = await csrfFetch('/api/billing/portal', { credentials: 'include' });
                    if (!r.ok) throw new Error();
                    const d = await r.json();
                    window.location.href = d.url;
                } catch { showToast('Unable to open billing portal.'); }
            });
        }
    } catch {
        const content = document.getElementById('manage-sub-content');
        if (content) content.innerHTML = '<p style="color:#ff6b6b;">Failed to load subscription details. Please try again.</p>';
    }
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
