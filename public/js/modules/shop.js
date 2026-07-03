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
const SLOT_LABELS = { theme: 'Themes', board: 'Boards', calculator: 'Calculators', header: 'Headers' };
const SLOT_ORDER = ['theme', 'board', 'calculator', 'header'];

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

function itemCardHTML(id, item) {
    const owned = state.owned.includes(id);
    const equipped = state.equipped[item.slot] === id;
    const affordable = state.coins >= item.price;
    let action;
    if (equipped) {
        action = `<button class="shop-btn shop-btn-equipped" data-act="unequip" data-slot="${esc(item.slot)}">Equipped ✓</button>`;
    } else if (owned) {
        action = `<button class="shop-btn shop-btn-equip" data-act="equip" data-slot="${esc(item.slot)}" data-id="${esc(id)}">Equip</button>`;
    } else {
        action = `<button class="shop-btn shop-btn-buy" data-act="buy" data-id="${esc(id)}" ${affordable ? '' : 'disabled'}>
                    🪙 ${item.price}${affordable ? '' : ' — need more'}
                  </button>`;
    }
    return `
      <div class="shop-item shop-rarity-${esc(item.rarity)}">
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
