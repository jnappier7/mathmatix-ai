// modules/statusCard.js
// Personal Status Card — the "who am I in Mathmatix" surface. Replaces the dead
// Progress button (which used to click a mobile-only drawer that has no desktop
// presentation) with a proper centered modal that works on every viewport AND
// surfaces daily quests, which were previously buried in that unreachable drawer.
//
// Everything is built from data already on the client (window.currentUser) plus
// the existing /api/daily-quests endpoint — no new server work.
//
// Forward slots (light up when those systems ship, hidden until then):
//   • Coins        — shown only if currentUser.wallet.coins is present.
//   • Full-body avatar — today shows the DiceBear portrait; the "Creation Lab"
//     CTA deep-links to the existing avatar builder.

import { highestTitle } from './rankTitles.js';
import { resolveAvatarUrl } from './avatarResolver.js';

const MODAL_ID = 'status-card-modal';

function ringDash(progress) {
    const r = 26, c = 2 * Math.PI * r;
    return { c, offset: c * (1 - Math.max(0, Math.min(1, progress))) };
}

function avatarMarkup(user) {
    const url = resolveAvatarUrl(user);
    if (url) return `<img class="sc-avatar-img" src="${url}" alt="Your avatar" />`;
    const initial = (user?.firstName || '?').charAt(0);
    return `<span class="sc-avatar-initial" aria-hidden="true">${initial}</span>`;
}

function tutorMessage(user) {
    // Persona-authentic line from the selected tutor. Real data (their catchphrase),
    // not fabricated praise. A richer, history-aware message can replace this once
    // a tutorPlan-backed endpoint exists.
    const cfg = window.TUTOR_CONFIG || {};
    const tutor = cfg[user?.selectedTutorId];
    if (!tutor) return null;
    return { name: tutor.name, image: tutor.image, text: tutor.catchphrase || '' };
}

function questRowHTML(q) {
    const pct = q.targetCount > 0 ? Math.min((q.progress / q.targetCount) * 100, 100) : 0;
    return `
      <div class="sc-quest ${q.completed ? 'is-complete' : ''}">
        <div class="sc-quest-top">
          <span class="sc-quest-name">${q.completed ? '✅ ' : ''}${q.name || q.title || q.type || 'Quest'}</span>
          <span class="sc-quest-reward">+${q.xpReward || 50} XP</span>
        </div>
        <div class="sc-quest-bar"><div class="sc-quest-fill" style="width:${pct}%"></div></div>
        <div class="sc-quest-count">${q.progress || 0}/${q.targetCount || 0}</div>
      </div>`;
}

async function loadQuests(mount) {
    try {
        const res = await fetch('/api/daily-quests', { credentials: 'include' });
        if (!res.ok) throw new Error(`quests ${res.status}`);
        const data = await res.json();
        const quests = data?.quests || [];
        if (!quests.length) {
            mount.innerHTML = `<div class="sc-quests-empty">No quests right now — check back tomorrow!</div>`;
            return;
        }
        mount.innerHTML = quests.map(questRowHTML).join('');
    } catch (e) {
        mount.innerHTML = `<div class="sc-quests-empty">Couldn't load quests. Try again in a bit.</div>`;
        console.warn('Status card quests failed', e);
    }
}

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const STRAND_LABEL = {
    'number-operations': 'Number & operations',
    'algebra': 'Algebra',
    'geometry': 'Geometry',
    'measurement-data': 'Measurement & data',
    'statistics-probability': 'Statistics & probability',
    'functions': 'Functions',
};
const strandLabel = (s) => STRAND_LABEL[s] || String(s || '').replace(/-/g, ' ');

// The climb card: the student's current band as a short ladder of SKILLS
// (owner: rungs are skills with learn/prove/teach stages, never grade levels).
// Reads the same /api/mastery/map the full skill-map page uses; cached for the
// session — the map moves at most a few times a day.
let mapCache = null;

function rungHTML(skill, kind) {
    const tag = kind === 'current'
        ? (skill.state === 'learned' ? 'proving it · you are here' : 'learning it · you are here')
        : skill.state === 'taught' ? '✓ taught'
        : (skill.state === 'proved' || skill.state === 'above') ? '✓ proved'
        : '';
    return `<div class="sc-rung is-${kind}">
        <span class="sc-rung-name">${esc(skill.label || skill.skillId)}</span>
        ${tag ? `<span class="sc-rung-tag">${tag}</span>` : ''}
      </div>`;
}

async function loadLadder(block) {
    const mount = block.querySelector('#sc-ladder-mount');
    try {
        if (!mapCache) {
            const res = await fetch('/api/mastery/map', { credentials: 'include' });
            if (!res.ok) throw new Error(`map ${res.status}`);
            mapCache = await res.json();
        }
        const data = mapCache;
        if (!data.seeded || !Array.isArray(data.skills) || !data.skills.length) { block.hidden = true; return; }

        // The band to show: the one the map engine says is nearest to closable;
        // fall back to the band with the most progress still in flight.
        let strand = data.nearest?.strand, level = data.nearest?.courseLevel;
        if (!strand) {
            const inFlight = (data.bands || []).filter((b) => b.owned > 0 && b.owned < b.total)
                .sort((a, b) => b.pct - a.pct)[0];
            if (!inFlight) { block.hidden = true; return; }
            strand = inFlight.strand; level = inFlight.courseLevel;
        }
        const band = data.skills.filter((s) => s.strand === strand && s.courseLevel === level);
        const done = band.filter((s) => s.state === 'taught' || s.state === 'proved' || s.state === 'above');
        const current = band.find((s) => s.skillId === data.nearest?.nextSkillId)
            || band.find((s) => s.canAttempt)
            || band.find((s) => s.state === 'open' || s.state === 'learned');
        const ahead = band.filter((s) => s !== current && !done.includes(s)
            && (s.state === 'locked' || s.state === 'open' || s.state === 'learned'));
        if (!current && !done.length) { block.hidden = true; return; }

        // Top-to-bottom: what's ahead, where they stand, what's already earned.
        const rows = []
            .concat(ahead.slice(0, 2).reverse().map((s) => rungHTML(s, 'ahead')))
            .concat(current ? [rungHTML(current, 'current')] : [])
            .concat(done.slice(-2).reverse().map((s) => rungHTML(s, 'done')));
        mount.innerHTML = rows.join('');
        block.querySelector('.sc-ladder-sub').textContent =
            `${strandLabel(strand)} · learn it, prove it, teach it`;
        block.hidden = false;
    } catch (e) {
        block.hidden = true;   // no ladder beats a broken ladder
        console.warn('Status card ladder failed', e);
    }
}

function buildModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'sc-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Your status card');
    modal.hidden = true;
    modal.innerHTML = `
      <div class="sc-backdrop" data-sc-close></div>
      <div class="sc-card" role="document">
        <button class="sc-close" type="button" aria-label="Close" data-sc-close>&times;</button>

        <div class="sc-hero">
          <div class="sc-avatar-wrap">
            <svg class="sc-ring" viewBox="0 0 60 60" aria-hidden="true">
              <circle class="sc-ring-track" cx="30" cy="30" r="26" />
              <circle class="sc-ring-fill" cx="30" cy="30" r="26" transform="rotate(-90 30 30)" />
            </svg>
            <span class="sc-avatar"></span>
            <span class="sc-level-badge"><span class="sc-level-num">1</span></span>
          </div>
          <div class="sc-identity">
            <div class="sc-name"></div>
            <div class="sc-rank"></div>
            <a class="sc-lab-cta" href="/pick-avatar.html">🎨 Choose your character</a>
          </div>
        </div>

        <div class="sc-stats">
          <div class="sc-stat"><span class="sc-stat-val sc-xp">0 / 100</span><span class="sc-stat-label">XP to next level</span></div>
          <div class="sc-stat"><span class="sc-stat-val sc-total-xp">0</span><span class="sc-stat-label">Total XP</span></div>
          <div class="sc-stat sc-coins-stat" hidden><span class="sc-stat-val sc-coins">0</span><span class="sc-stat-label">Coins</span></div>
          <div class="sc-stat"><span class="sc-stat-val sc-streak">0</span><span class="sc-stat-label">Day streak</span></div>
        </div>

        <div class="sc-progress-row">
          <div class="sc-progress-bar"><div class="sc-progress-fill"></div></div>
        </div>

        <div class="sc-ladder-block" hidden>
          <div class="sc-block-head">🪜 Your climb
            <a class="sc-map-link" href="/skill-map.html">See the whole map →</a>
          </div>
          <div class="sc-ladder-sub"></div>
          <div class="sc-ladder" id="sc-ladder-mount"></div>
        </div>

        <div class="sc-store-block">
          <div class="sc-store-info">
            <div class="sc-store-title">🛍️ Store</div>
            <div class="sc-store-sub">Board skins, avatar gear</div>
          </div>
          <button type="button" class="sc-store-btn">Shop</button>
        </div>

        <div class="sc-tutor" hidden>
          <img class="sc-tutor-img" alt="" />
          <div class="sc-tutor-bubble"><span class="sc-tutor-name"></span><span class="sc-tutor-text"></span></div>
        </div>

        <div class="sc-quests-block">
          <div class="sc-quests-head">🎯 Today's Quests</div>
          <div class="sc-quests" id="sc-quests-mount"><div class="sc-quests-empty">Loading…</div></div>
        </div>
      </div>`;

    document.body.appendChild(modal);
    modal.querySelectorAll('[data-sc-close]').forEach(el =>
        el.addEventListener('click', closeStatusCard));
    modal.querySelector('.sc-store-btn')?.addEventListener('click', () => {
        closeStatusCard();
        if (typeof window.openShop === 'function') window.openShop();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hidden) closeStatusCard();
    });
    return modal;
}

function populate(modal, user) {
    if (!user) return;
    const q = (sel) => modal.querySelector(sel);

    // Full-body character in the hero when they've chosen one; otherwise the
    // circular portrait + XP ring.
    const wrap = q('.sc-avatar-wrap');
    if (window.AvatarFullBody && window.AvatarFullBody.hasFullBody(user)) {
        q('.sc-avatar').innerHTML = window.AvatarFullBody.html(user, { size: 'sm' });
        if (wrap) wrap.classList.add('sc-fullbody');
    } else {
        q('.sc-avatar').innerHTML = avatarMarkup(user);
        if (wrap) wrap.classList.remove('sc-fullbody');
    }
    q('.sc-name').textContent = user.firstName || 'Mathematician';
    q('.sc-level-num').textContent = String(user.level || 1);

    // Rank title (identity layer).
    const rank = highestTitle(user.xpLadderStats?.tier3Behaviors);
    q('.sc-rank').textContent = rank ? rank.title : 'Rising Mathematician';

    // XP + progress ring/bar.
    const cur = Number(user.xpForCurrentLevel) || 0;
    const need = Number(user.xpForNextLevel) || 100;
    const progress = need > 0 ? cur / need : 0;
    q('.sc-xp').textContent = `${cur} / ${need}`;
    q('.sc-total-xp').textContent = String(user.xp ?? 0);
    q('.sc-streak').textContent = String(user.dailyQuests?.currentStreak ?? 0);

    const { c, offset } = ringDash(progress);
    const fill = q('.sc-ring-fill');
    fill.setAttribute('stroke-dasharray', c.toFixed(2));
    fill.setAttribute('stroke-dashoffset', offset.toFixed(2));
    q('.sc-progress-fill').style.width = `${Math.min(100, progress * 100)}%`;

    // Coins — forward slot, only shown once a wallet exists.
    const coins = user.wallet?.coins;
    if (coins != null) {
        q('.sc-coins').textContent = String(coins);
        q('.sc-coins-stat').hidden = false;
        q('.sc-store-sub').textContent =
            `${coins} coin${coins === 1 ? '' : 's'} to spend — board skins, avatar gear`;
    }

    // Tutor message.
    const msg = tutorMessage(user);
    const tutorEl = q('.sc-tutor');
    if (msg && msg.text) {
        q('.sc-tutor-img').src = `/images/tutor_avatars/${msg.image}`;
        q('.sc-tutor-img').alt = msg.name;
        q('.sc-tutor-name').textContent = msg.name;
        q('.sc-tutor-text').textContent = msg.text;
        tutorEl.hidden = false;
    } else {
        tutorEl.hidden = true;
    }
}

export function openStatusCard() {
    const user = window.currentUser;
    const modal = buildModal();
    populate(modal, user);
    loadQuests(modal.querySelector('#sc-quests-mount'));
    loadLadder(modal.querySelector('.sc-ladder-block'));
    modal.hidden = false;
    void modal.offsetWidth; // reflow so the open transition runs
    modal.classList.add('sc-open');
}

export function closeStatusCard() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.classList.remove('sc-open');
    setTimeout(() => { modal.hidden = true; }, 200);
}

if (typeof window !== 'undefined') {
    window.openStatusCard = openStatusCard;
    window.closeStatusCard = closeStatusCard;
}
