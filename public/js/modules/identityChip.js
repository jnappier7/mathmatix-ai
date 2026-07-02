// modules/identityChip.js
// Feature B — Identity Chip (level ring + rank title). A persistent identity /
// goal-gradient display in the chat header: the student's avatar wrapped in a
// level-progress ring, their level, and their highest-earned rank title.
//
// Data sources (all already on the client — no new endpoint, see D2):
//   • currentUser.xpForCurrentLevel / xpForNextLevel  (ring fill)
//   • currentUser.level                                (badge)
//   • currentUser.xpLadderStats.tier3Behaviors         (rank titles)
//   • currentUser.avatar.dicebearUrl                   (portrait)
//
// FERPA: this chip is the student's OWN header view, so no directory-info
// redaction is needed here. Classmate-visible rank surfaces (leaderboard rows,
// Showdown cards) ship in Feature C and MUST run through hasOptedOutOfDirectoryInfo.

import { triggerConfetti } from './helpers.js';
import { computeEarnedTitles, highestTitle } from './rankTitles.js';

const RING_R = 16;
const RING_C = 2 * Math.PI * RING_R; // circumference

const SELECTED_KEY = 'mm_selected_title';   // behavior the student chose to display
const LAST_SEEN_KEY = 'mm_last_rank_title';  // for one-time earn ceremony

let lastProgress = null;

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

function avatarMarkup(user) {
    const url = user?.avatar?.dicebearUrl;
    if (url) return `<img class="identity-avatar-img" src="${url}" alt="My avatar" />`;
    const initial = (user?.firstName || '?').charAt(0);
    return `<span class="identity-avatar-initial" aria-hidden="true">${initial}</span>`;
}

function buildChip() {
    const host = document.querySelector('.cr-header-extras');
    if (!host) return null;
    let chip = document.getElementById('cr-identity-chip');
    if (chip) return chip;

    chip = document.createElement('button');
    chip.type = 'button';
    chip.id = 'cr-identity-chip';
    chip.className = 'cr-identity-chip';
    chip.setAttribute('aria-label', 'Your level and rank');
    chip.innerHTML = `
      <span class="identity-ring-wrap">
        <svg class="identity-ring" viewBox="0 0 40 40" aria-hidden="true">
          <circle class="identity-ring-track" cx="20" cy="20" r="${RING_R}" />
          <circle class="identity-ring-fill" cx="20" cy="20" r="${RING_R}"
                  stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${RING_C.toFixed(2)}"
                  transform="rotate(-90 20 20)" />
        </svg>
        <span class="identity-avatar">${avatarMarkup(null)}</span>
        <span class="identity-level" id="cr-identity-level">1</span>
      </span>
      <span class="identity-title" id="cr-identity-title" hidden></span>
    `;
    // Insert to the LEFT of the streak pill.
    const streak = document.getElementById('cr-streak-pill');
    if (streak && streak.parentElement === host) host.insertBefore(chip, streak);
    else host.insertBefore(chip, host.firstChild);

    chip.addEventListener('click', toggleTitlePopover);
    return chip;
}

/** The title to display: the student's chosen one if still earned, else highest. */
function resolveDisplayTitle(user) {
    const behaviors = user?.xpLadderStats?.tier3Behaviors;
    const earned = computeEarnedTitles(behaviors);
    if (!earned.length) return null;
    const chosen = lsGet(SELECTED_KEY);
    if (chosen) {
        const match = earned.find(e => e.behavior === chosen);
        if (match) return match;
    }
    return earned[0]; // highest
}

function toggleTitlePopover(evt) {
    if (evt) evt.stopPropagation();
    const existing = document.getElementById('cr-title-popover');
    if (existing) { existing.remove(); return; }

    const user = window.currentUser;
    const earned = computeEarnedTitles(user?.xpLadderStats?.tier3Behaviors);
    const chip = document.getElementById('cr-identity-chip');
    if (!chip) return;

    const pop = document.createElement('div');
    pop.id = 'cr-title-popover';
    pop.className = 'cr-title-popover';
    pop.setAttribute('role', 'menu');

    if (!earned.length) {
        pop.innerHTML = `<div class="cr-title-empty">Earn rank titles by showing your thinking —
          catch your own mistakes, explain your reasoning, stick with hard problems.</div>`;
    } else {
        const current = resolveDisplayTitle(user);
        pop.innerHTML = `<div class="cr-title-head">Choose your title</div>` +
            earned.map(e => `
              <button type="button" class="cr-title-option${current && e.behavior === current.behavior ? ' is-active' : ''}"
                      data-behavior="${e.behavior}" role="menuitemradio">
                <span class="cr-title-name">${e.title}</span>
                <span class="cr-title-meta">${e.count}×</span>
              </button>`).join('');
    }

    document.body.appendChild(pop);
    const r = chip.getBoundingClientRect();
    pop.style.top = `${r.bottom + 8}px`;
    pop.style.left = `${Math.max(8, r.left)}px`;

    pop.querySelectorAll('.cr-title-option').forEach(btn => {
        btn.addEventListener('click', () => {
            lsSet(SELECTED_KEY, btn.dataset.behavior);
            pop.remove();
            updateIdentityChip(window.currentUser);
        });
    });

    // Dismiss on outside click.
    setTimeout(() => {
        const onDoc = (e) => {
            if (!pop.contains(e.target) && e.target !== chip) {
                pop.remove();
                document.removeEventListener('click', onDoc);
            }
        };
        document.addEventListener('click', onDoc);
    }, 0);
}

function fireTitleCeremony(title) {
    try { triggerConfetti(); } catch { /* optional */ }
    const card = document.createElement('div');
    card.className = 'title-card-celebration';
    card.setAttribute('role', 'status');
    card.innerHTML = `
      <div class="title-card-inner">
        <div class="title-card-eyebrow">New Title Earned</div>
        <div class="title-card-name">${title}</div>
        <div class="title-card-sub">This is who you're becoming.</div>
      </div>`;
    document.body.appendChild(card);
    void card.offsetWidth;
    card.classList.add('show');
    const dismiss = () => {
        card.classList.remove('show');
        setTimeout(() => card.remove(), 400);
    };
    card.addEventListener('click', dismiss);
    setTimeout(dismiss, 4500);
}

/**
 * Update the chip from the current user object. Safe to call every turn.
 * @param {Object} user
 * @param {{celebrate?: boolean}} [opts] celebrate=false seeds the baseline
 *   without firing the earn ceremony (used on initial load).
 */
export function updateIdentityChip(user, opts = {}) {
    const { celebrate = true } = opts;
    if (!user) return;
    const chip = buildChip();
    if (!chip) return;

    // Avatar (may have changed via Avatar Builder).
    const avatarSlot = chip.querySelector('.identity-avatar');
    if (avatarSlot) avatarSlot.innerHTML = avatarMarkup(user);

    // Level badge.
    const levelEl = chip.querySelector('#cr-identity-level');
    if (levelEl && user.level != null) levelEl.textContent = String(user.level);

    // Ring progress toward next level.
    const cur = Number(user.xpForCurrentLevel);
    const need = Number(user.xpForNextLevel);
    const progress = (need > 0 && Number.isFinite(cur)) ? Math.max(0, Math.min(1, cur / need)) : 0;
    const fill = chip.querySelector('.identity-ring-fill');
    if (fill) {
        fill.style.strokeDashoffset = String(RING_C * (1 - progress));
        // Pulse when the ring grows (goal-gradient reinforcement).
        if (lastProgress !== null && progress > lastProgress) {
            chip.classList.remove('identity-pulse');
            void chip.offsetWidth;
            chip.classList.add('identity-pulse');
        }
    }
    lastProgress = progress;

    // Rank title.
    const titleEl = chip.querySelector('#cr-identity-title');
    const display = resolveDisplayTitle(user);
    if (titleEl) {
        if (display) {
            titleEl.textContent = display.title;
            titleEl.hidden = false;
        } else {
            titleEl.textContent = '';
            titleEl.hidden = true;
        }
    }

    // One-time earn ceremony when the student's HIGHEST title advances.
    // Baseline is seeded on first sight (or the init call) so we never fire
    // retroactively for titles the student already had — only genuine advances.
    const top = highestTitle(user.xpLadderStats?.tier3Behaviors);
    const currentKey = top ? `${top.behavior}:${top.tier}` : 'none';
    const stored = lsGet(LAST_SEEN_KEY);
    if (stored === null) {
        lsSet(LAST_SEEN_KEY, currentKey); // seed baseline, no ceremony
    } else if (stored !== currentKey) {
        lsSet(LAST_SEEN_KEY, currentKey);
        if (top && celebrate) fireTitleCeremony(top.title);
    }
}

/** Initialize on page load. Seeds the title baseline without a ceremony. */
export function initIdentityChip(user) {
    buildChip();
    updateIdentityChip(user, { celebrate: false });
}
