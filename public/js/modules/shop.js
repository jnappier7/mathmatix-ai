// modules/shop.js
// Cosmetics shop modal — closes the Coins loop (earn → spend). A thin UI over
// the server-authoritative endpoints in routes/cosmetics.js:
//   GET  /api/cosmetics/catalog   → { catalog, coins, owned, equipped }
//   POST /api/cosmetics/purchase  { itemId }
//   POST /api/cosmetics/equip     { slot, itemId }
// Buying/equipping never trust the client — the server validates and returns the
// new balance/loadout, which we reflect locally.

import { applyCosmetics } from './cosmeticsApply.js';

const MODAL_ID = 'shop-modal';
const SLOT_LABELS = {
    theme: 'Themes', bubble: 'Chat Bubbles', avatarFrame: 'Avatar Frames',
    board: 'Boards', calculator: 'Calculators', header: 'Headers',
};
const SLOT_ORDER = ['theme', 'bubble', 'avatarFrame', 'board', 'calculator', 'header'];

let state = { catalog: {}, coins: 0, owned: [], equipped: {} };

function esc(s) {
    const el = document.createElement('span');
    el.textContent = s == null ? '' : String(s);
    return el.innerHTML;
}

function post(url, body) {
    // csrfFetch is a page global (double-submit CSRF). Fall back to fetch if absent.
    const fn = window.csrfFetch || fetch;
    return fn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
    });
}

function buildModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'shop-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Cosmetics shop');
    modal.hidden = true;
    modal.innerHTML = `
      <div class="shop-backdrop" data-shop-close></div>
      <div class="shop-card" role="document">
        <div class="shop-head">
          <h2 class="shop-title">Shop</h2>
          <span class="shop-coins" aria-live="polite">🪙 <span class="shop-coins-val">0</span></span>
          <button class="shop-close" type="button" aria-label="Close" data-shop-close>&times;</button>
        </div>
        <div class="shop-body" id="shop-body"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-shop-close]').forEach(el => el.addEventListener('click', closeShop));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeShop(); });
    modal.querySelector('#shop-body').addEventListener('click', onBodyClick);
    return modal;
}

// Preview swatches mirror the look each cosmetic gives in-app, so the shop reads
// like a wardrobe you can browse. Keep in rough sync with public/css/cosmetics.css.
const PREVIEW = {
    'theme.bubblegum': 'linear-gradient(135deg,#ff5db1,#a855f7)',
    'theme.forest':    'linear-gradient(135deg,#2fae66,#16a34a)',
    'theme.sunset':    'linear-gradient(135deg,#ff7a3b,#ff3b7f)',
    'theme.ocean':     'linear-gradient(135deg,#06b6d4,#3b82f6)',
    'theme.neon':      'linear-gradient(135deg,#00e5ff,#7c4dff)',
    'theme.galaxy':    'linear-gradient(135deg,#7c3aed,#ec4899 55%,#22d3ee)',
    'theme.gold':      'linear-gradient(135deg,#f6d365,#d4af37 45%,#b8860b)',
    'bubble.gradient': 'linear-gradient(135deg,#7c6bff,#ff5db1)',
    'bubble.glass':    'linear-gradient(135deg,#cbd5e1,#94a3b8)',
    'bubble.gold':     'linear-gradient(135deg,#fff8e6,#ffe9a8)',
    'bubble.holo':     'linear-gradient(135deg,#a8edea,#fed6e3 30%,#d0bdf4 60%,#a1c4fd)',
    'frame.silver':    'linear-gradient(135deg,#e2e8f0,#94a3b8)',
    'frame.gold':      'linear-gradient(135deg,#f6d365,#d4af37)',
    'frame.neon':      'linear-gradient(135deg,#22d3ee,#7c4dff)',
    'frame.rainbow':   'conic-gradient(from 0deg,#ff5db1,#ffd93b,#4ade80,#22d3ee,#a855f7,#ff5db1)',
    'board.grid':      'repeating-linear-gradient(0deg,#e6f0ff 0 5px,#c7dbff 5px 6px)',
    'board.chalk':     '#24322b',
    'board.cheetah':   'radial-gradient(circle at 30% 30%,#5b3a1a 20%,transparent 21%),#f2c14e',
    'calc.hotpink':    'linear-gradient(135deg,#ff5db1,#ff2e93)',
    'calc.carbon':     'repeating-linear-gradient(45deg,#2b2f36 0 4px,#23262c 4px 8px)',
    'header.camo':     'radial-gradient(circle at 30% 40%,#6b7d4f 30%,#5a6b42 31%)',
    'header.wave':     'linear-gradient(135deg,#667eea,#22d3ee 50%,#06b6d4)',
};

function swatchHTML(id, rarity) {
    const bg = PREVIEW[id] || 'linear-gradient(135deg,#cbd5db,#9aa7b2)';
    return `<div class="shop-swatch shop-swatch-${esc(rarity)}" style="background:${bg}" aria-hidden="true"></div>`;
}

function itemCardHTML(id, item) {
    const owned = state.owned.includes(id);
    const equipped = state.equipped[item.slot] === id;
    const affordable = state.coins >= item.price;
    const level = (window.currentUser && window.currentUser.level) || 1;
    const locked = item.unlockLevel && level < item.unlockLevel && !owned;
    let action;
    if (equipped) {
        action = `<button class="shop-btn shop-btn-equipped" data-act="unequip" data-slot="${esc(item.slot)}">Equipped ✓</button>`;
    } else if (owned) {
        action = `<button class="shop-btn shop-btn-equip" data-act="equip" data-slot="${esc(item.slot)}" data-id="${esc(id)}">Equip</button>`;
    } else if (locked) {
        action = `<button class="shop-btn shop-btn-locked" disabled>🔒 Reach Level ${item.unlockLevel}</button>`;
    } else {
        action = `<button class="shop-btn shop-btn-buy" data-act="buy" data-id="${esc(id)}" ${affordable ? '' : 'disabled'}>
                    🪙 ${item.price}${affordable ? '' : ' — need more'}
                  </button>`;
    }
    return `
      <div class="shop-item shop-rarity-${esc(item.rarity)}">
        ${swatchHTML(id, item.rarity)}
        <div class="shop-item-name">${esc(item.name)}</div>
        <div class="shop-item-rarity">${esc(item.rarity)}</div>
        ${action}
      </div>`;
}

function render() {
    const modal = buildModal();
    modal.querySelector('.shop-coins-val').textContent = String(state.coins);
    const body = modal.querySelector('#shop-body');

    // Group catalog by slot.
    const bySlot = {};
    Object.entries(state.catalog).forEach(([id, item]) => {
        (bySlot[item.slot] = bySlot[item.slot] || []).push([id, item]);
    });

    const sections = SLOT_ORDER.filter(s => bySlot[s]).map(slot => {
        const items = bySlot[slot]
            .sort((a, b) => a[1].price - b[1].price)
            .map(([id, item]) => itemCardHTML(id, item)).join('');
        return `<section class="shop-section">
                  <h3 class="shop-section-head">${esc(SLOT_LABELS[slot] || slot)}</h3>
                  <div class="shop-grid">${items}</div>
                </section>`;
    }).join('');

    body.innerHTML = sections || `<div class="shop-empty">The shop is empty right now.</div>`;
}

async function onBodyClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    btn.disabled = true;
    try {
        if (act === 'buy') {
            const res = await post('/api/cosmetics/purchase', { itemId: btn.dataset.id });
            const data = await res.json();
            if (!res.ok || !data.success) return flash(btn, data.error === 'insufficient_coins' ? 'Not enough' : 'Failed');
            state.coins = data.coins;
            state.owned = data.owned || state.owned.concat(btn.dataset.id);
            if (window.currentUser) { window.currentUser.wallet = window.currentUser.wallet || {}; window.currentUser.wallet.coins = data.coins; }
            render();
        } else if (act === 'equip' || act === 'unequip') {
            const slot = btn.dataset.slot;
            const itemId = act === 'equip' ? btn.dataset.id : 'default';
            const res = await post('/api/cosmetics/equip', { slot, itemId });
            const data = await res.json();
            if (!res.ok || !data.success) return flash(btn, 'Failed');
            state.equipped = data.equipped || { ...state.equipped, [slot]: itemId };
            if (window.currentUser) window.currentUser.equippedCosmetics = state.equipped;
            applyCosmetics(window.currentUser); // reflect the change live
            render();
        }
    } catch (err) {
        console.warn('Shop action failed', err);
        flash(btn, 'Error');
    }
}

function flash(btn, msg) {
    const orig = btn.textContent;
    btn.textContent = msg;
    btn.disabled = false;
    setTimeout(() => { btn.textContent = orig; render(); }, 1200);
}

export async function openShop() {
    const modal = buildModal();
    modal.querySelector('#shop-body').innerHTML = `<div class="shop-empty">Loading…</div>`;
    modal.hidden = false;
    void modal.offsetWidth;
    modal.classList.add('shop-open');
    try {
        const res = await fetch('/api/cosmetics/catalog', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error('catalog');
        state = { catalog: data.catalog || {}, coins: data.coins || 0, owned: data.owned || [], equipped: data.equipped || {} };
        render();
    } catch (err) {
        console.warn('Shop load failed', err);
        modal.querySelector('#shop-body').innerHTML = `<div class="shop-empty">Couldn't load the shop. Try again.</div>`;
    }
}

export function closeShop() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.classList.remove('shop-open');
    setTimeout(() => { modal.hidden = true; }, 200);
}

if (typeof window !== 'undefined') {
    window.openShop = openShop;
    window.closeShop = closeShop;
}
