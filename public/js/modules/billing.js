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

        // Trial countdown banner for users currently in a Mathmatix+ trial
        updateTrialBanner(data);

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
 * Show a small, non-blocking banner while a Mathmatix+ trial is active, counting
 * down the days left. Reassures rather than nags — the point is transparency so
 * the eventual charge is never a surprise. Removed automatically once the trial
 * converts (isTrialing false).
 */
export function updateTrialBanner(data) {
    const existing = document.getElementById('trial-banner');
    if (!data || !data.isTrialing) {
        if (existing) existing.remove();
        return;
    }
    const days = data.trialDaysRemaining || 1;
    const dayWord = days === 1 ? 'day' : 'days';
    let banner = existing;
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'trial-banner';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,#00d4ff,#7b2ff7);color:#fff;padding:7px 14px;font-size:13px;text-align:center;z-index:1800;box-shadow:0 2px 8px rgba(0,0,0,0.25);';
        document.body.appendChild(banner);
    }
    banner.innerHTML = `✨ Mathmatix+ trial: <strong>${days} ${dayWord} left</strong> of full access. `
        + '<span id="trial-banner-manage" role="button" style="text-decoration:underline;cursor:pointer;">Manage subscription</span>';
    const manage = banner.querySelector('#trial-banner-manage');
    if (manage) manage.addEventListener('click', () => showManageSubscription());
}

/**
 * Update the floating time-remaining indicator.
 * Shows AI processing time remaining (not wall-clock time).
 * Time only counts while the AI is generating a response — reading/thinking is free.
 */
/**
 * Styles for the free-time pill.
 *
 * These live in a stylesheet rather than the element's `style` attribute so a
 * media query can move the pill on small screens. As an inline `cssText` the
 * desktop coordinates below (bottom:160px) applied to phones too, where 160px
 * from the bottom is the middle of the conversation — the pill sat on top of
 * the tutor's reply on every phone, covering the text a student was mid-way
 * through reading. Inline styles outrank stylesheets, so no CSS file could
 * correct it.
 *
 * Injected by the module itself, so any page importing billing.js gets the
 * positioning without having to remember a <link>.
 */
const TIME_PILL_STYLE_ID = 'mm-time-pill-styles';
function ensureTimePillStyles() {
    if (document.getElementById(TIME_PILL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TIME_PILL_STYLE_ID;
    style.textContent = `
      #free-time-indicator {
        position: fixed;
        z-index: 1750;
        max-width: 280px;
        padding: 8px 14px;
        border-radius: 10px;
        background: #1a1a2e;
        color: #fff;
        font-size: 13px;
        border: 1px solid #333;
        box-shadow: 0 6px 18px rgba(0,0,0,0.35);
        cursor: pointer;
        transition: all 0.3s;
      }
      /* Desktop: stacked above the voice orb (bottom:30/right:30, ~150px tall
         with its status label) so the two read as one corner stack, and the
         "Resets in…" sub-line clears the orb's drop shadow. */
      @media (min-width: 769px) {
        #free-time-indicator { bottom: 160px; right: 30px; }
      }
      /* Phones: dock it to the TOP, under the #mpc-topbar row. The message
         stream owns the bottom two-thirds of a phone screen, so anything fixed
         down there covers what the student is reading. Up here it overlaps only
         the decorative tutor poster. (PR2 folds this into the stat strip.) */
      @media (max-width: 768px) {
        #free-time-indicator {
          top: calc(env(safe-area-inset-top, 0px) + 56px);
          right: 12px;
          max-width: calc(100vw - 24px);
          font-size: 12px;
          padding: 6px 11px;
        }
      }
    `;
    document.head.appendChild(style);
}

/**
 * Show/hide the pill, and mirror that onto <body> so layout can react.
 *
 * On phones the pill is docked to the top (see ensureTimePillStyles), where it
 * would otherwise sit on top of the first card in the message list. Rather than
 * hand the pill a magic z-index and let it cover content — the bug this whole
 * change is undoing — the body class lets the message list reserve the space,
 * so the pill overlaps nothing. Desktop ignores the class entirely.
 */
function setPillVisible(indicator, visible) {
    indicator.style.display = visible ? '' : 'none';
    document.body.classList.toggle('mm-has-time-pill', visible);
}

export function updateFreeTimeIndicator(usage) {
    let indicator = document.getElementById('free-time-indicator');
    if (!indicator) {
        ensureTimePillStyles();
        indicator = document.createElement('div');
        indicator.id = 'free-time-indicator';
        indicator.title = 'AI processing time only — reading and thinking time is free';
        indicator.addEventListener('click', () => showUpgradePrompt({}));
        document.body.appendChild(indicator);
    }

    const remaining = usage.secondsRemaining || 0;
    const mins = Math.floor(remaining / 60);

    // QA P2: the pill is fixed over the bottom-right, which can sit on top of
    // Work Board graphs/cards. Let the student dismiss it for the session so it
    // doesn't block the canvas — BUT force it back (and clear the dismissal)
    // once time runs low/out, so the upgrade nudge can't be permanently hidden.
    const DISMISS_KEY = 'mm_time_pill_dismissed';
    const isCritical = usage.limitReached || remaining <= 300;
    const readFlag = () => { try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } };
    if (isCritical) {
        try { sessionStorage.removeItem(DISMISS_KEY); } catch { /* private mode */ }
    } else if (readFlag()) {
        setPillVisible(indicator, false);
        return;
    }
    setPillVisible(indicator, true);

    // Calculate human-readable reset time. "Resets soon" was the
    // previous fallback for the last hour, which my UI review flagged
    // as too vague. Show concrete minutes instead (rounded up so we
    // never claim "0 min" — that reads as "right now" but the budget
    // hasn't actually rolled over yet).
    let resetText = '';
    if (usage.nextResetAt) {
        const resetDate = new Date(usage.nextResetAt);
        const msUntilReset = resetDate - Date.now();
        if (msUntilReset > 0) {
            const daysUntil = Math.floor(msUntilReset / (1000 * 60 * 60 * 24));
            const hoursUntil = Math.floor((msUntilReset % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutesUntil = Math.max(1, Math.ceil(msUntilReset / 60000));
            if (daysUntil > 0) {
                resetText = `Resets in ${daysUntil}d ${hoursUntil}h`;
            } else if (hoursUntil > 0) {
                resetText = `Resets in ${hoursUntil}h`;
            } else {
                resetText = `Resets in ${minutesUntil}m`;
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
        // Comfortable state: offer a dismiss "×" so it can be cleared off the board.
        const dismissBtn = '<span id="mm-time-dismiss" role="button" aria-label="Hide time indicator" title="Hide — it comes back when your time runs low" style="position:absolute;top:-7px;right:-7px;width:18px;height:18px;line-height:15px;text-align:center;background:#33334d;color:#ccc;border:1px solid #555;border-radius:50%;font-size:12px;cursor:pointer;">&times;</span>';
        indicator.innerHTML = `<strong>${mins} min</strong> AI time left` + resetLine + subtitle + dismissBtn;
        indicator.style.borderColor = '#333';
        const x = indicator.querySelector('#mm-time-dismiss');
        if (x) x.addEventListener('click', (e) => {
            e.stopPropagation();
            try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
            // Via the helper so the reserved space is released too — hiding the
            // pill while <body> still claims it leaves a dead gap at the top of
            // the conversation.
            setPillVisible(indicator, false);
        });
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

    // Card-required free trial: offered to students who haven't trialed yet.
    // At the 30-min wall this is the primary CTA \u2014 highest-intent moment.
    const trialAvailable = !!(window._billingStatus && window._billingStatus.trialAvailable);
    const trialDays = (window._billingStatus && window._billingStatus.trialDays) || 7;

    // Students usually can't pay themselves — surface an "ask a parent" path so the
    // offer reaches the person who holds the card.
    const cu = window.currentUser || {};
    const isStudentUser = cu.role === 'student' || (Array.isArray(cu.roles) && cu.roles.includes('student'));

    const title = trialAvailable
        ? `Try Mathmatix+ free for ${trialDays} days`
        : promo
        ? 'Pi Day Special \u2014 $3.14 Off!'
        : 'Get Mathmatix+';
    const subtitle = trialAvailable
        ? (isLimitReached
            ? `Out of free minutes? Unlock everything free for ${trialDays} days. Card required \u2014 no charge until then, cancel anytime.`
            : `Full access to everything, free for ${trialDays} days. Card required \u2014 then $9.95/mo, cancel anytime.`)
        : isFeatureBlock
        ? `${errorData.feature} requires Mathmatix+.`
        : isLimitReached
        ? "You've used your free minutes this month. Upgrade for unlimited tutoring."
        : 'Unlimited 24/7 tutoring for your child. Cancel anytime.';

    // Price display
    let priceHtml;
    if (trialAvailable) {
        priceHtml = `<div style="font-size:34px;font-weight:bold;color:#00d4ff;margin:4px 0;">Free<span style="font-size:16px;color:#aaa;font-weight:normal"> for ${trialDays} days</span></div>
                     <div style="color:#888;font-size:13px;">then $9.95/mo &mdash; cancel anytime before then and pay nothing</div>`;
    } else if (promo && promo.prices.unlimited) {
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
            <button id="upgrade-go" style="background:linear-gradient(135deg,#00d4ff,#7b2ff7);color:#fff;border:none;padding:14px 32px;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;width:100%;">${trialAvailable ? `Start my ${trialDays}-day free trial` : 'Get Mathmatix+'}</button>
            ${trialAvailable
                ? `<div style="color:#888;font-size:12px;margin-top:12px;">We'll email you before your trial ends so you're never surprised. Cancel anytime — no charge until day ${trialDays}.</div>`
                : isLimitReached
                ? '<div style="color:#666;font-size:12px;margin-top:12px;">Your free minutes reset monthly. Upgrade for uninterrupted learning.</div>'
                : '<button id="upgrade-dismiss" style="background:transparent;color:#666;border:none;padding:10px;cursor:pointer;font-size:13px;width:100%;margin-top:10px;">Keep free plan (30 min/week)</button>'
            }
            ${trialAvailable && !isLimitReached
                ? '<button id="upgrade-dismiss" style="background:transparent;color:#666;border:none;padding:10px;cursor:pointer;font-size:13px;width:100%;margin-top:6px;">Maybe later</button>'
                : ''
            }
            ${isStudentUser ? `
            <div style="border-top:1px solid #333;margin:16px 0 12px;"></div>
            <button id="ask-parent-btn" style="background:transparent;color:#00d4ff;border:1px solid #00d4ff;padding:11px 20px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;width:100%;">🙋 Ask a parent to unlock this</button>
            <div id="ask-parent-status" style="color:#8fd; font-size:12px;margin-top:8px;display:none;"></div>
            <div id="parent-email-form" style="display:none;margin-top:10px;">
                <input id="parent-email-input" type="email" placeholder="parent@email.com" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #444;background:#12121f;color:#fff;font-size:14px;" />
                <button id="parent-email-send" style="background:#0d9488;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;width:100%;margin-top:8px;">Send my parent an invite</button>
            </div>` : ''}
        </div>`;
    document.body.appendChild(modal);

    document.getElementById('upgrade-go').addEventListener('click', () => initiateUpgrade('unlimited', { trial: trialAvailable }));
    const dismissBtn = document.getElementById('upgrade-dismiss');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => modal.remove());
    }
    if (isStudentUser) wireAskParent();
    // Only allow clicking outside to dismiss if it's not a usage limit block
    if (!isLimitReached) {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }
}

/**
 * Wire the "Ask a parent to unlock" flow inside the upgrade modal (students only).
 * Linked parent → notify them (server emails + notifies). No linked parent →
 * collect a parent email → send an invite. Gets the offer to the person with the card.
 */
function wireAskParent() {
    const btn = document.getElementById('ask-parent-btn');
    const statusEl = document.getElementById('ask-parent-status');
    const form = document.getElementById('parent-email-form');
    if (!btn) return;

    const showStatus = (msg, ok = true) => {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.style.color = ok ? '#8fd' : '#ffb3b3';
        statusEl.style.display = '';
    };
    const resetBtn = () => { btn.disabled = false; btn.textContent = '🙋 Ask a parent to unlock this'; };

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Asking…';
        try {
            const res = await csrfFetch('/api/student/request-parent-upgrade', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: '{}', credentials: 'include'
            });
            const data = await res.json();
            if (data && data.linked === false) {
                // No parent linked yet — collect an email to invite one.
                btn.style.display = 'none';
                if (form) form.style.display = '';
                showStatus("Add your parent's email and we'll send them the invite.");
            } else if (data && data.success) {
                btn.style.display = 'none';
                showStatus(data.message || 'We let your parent know!');
            } else {
                resetBtn();
                showStatus((data && data.message) || 'Could not reach your parent right now.', false);
            }
        } catch (e) {
            resetBtn();
            showStatus('Something went wrong. Please try again.', false);
        }
    });

    const sendBtn = document.getElementById('parent-email-send');
    if (sendBtn) sendBtn.addEventListener('click', async () => {
        const input = document.getElementById('parent-email-input');
        const email = ((input && input.value) || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showStatus('Please enter a valid email address.', false);
            return;
        }
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending…';
        try {
            const res = await csrfFetch('/api/student/invite-parent', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parentEmail: email }), credentials: 'include'
            });
            const data = await res.json();
            if (data && data.success) {
                if (form) form.style.display = 'none';
                showStatus(data.message || `Invite sent to ${email}.`);
            } else {
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send my parent an invite';
                showStatus((data && data.message) || 'Could not send the invite.', false);
            }
        } catch (e) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send my parent an invite';
            showStatus('Something went wrong. Please try again.', false);
        }
    });
}

/**
 * Redirect to Stripe checkout for a pack upgrade
 */
export async function initiateUpgrade(pack, opts = {}) {
    try {
        const body = { pack };
        if (opts.trial) body.trial = true;
        const res = await csrfFetch('/api/billing/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
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
        <div style="font-size:13px;color:#aaa;margin-bottom:14px;line-height:1.5;">You have <strong style="color:#00d4ff;">30 free minutes</strong> of AI tutoring this month. Want unlimited access?</div>
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
