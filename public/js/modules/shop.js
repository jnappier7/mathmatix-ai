// modules/shop.js
// Cosmetics shop modal — closes the Coins loop (earn → spend). A thin UI over
// the server-authoritative endpoints in routes/cosmetics.js:
//   GET  /api/cosmetics/catalog   → { catalog, coins, owned, equipped }
//   POST /api/cosmetics/purchase  { itemId }
//   POST /api/cosmetics/equip     { slot, itemId }
// Buying/equipping never trust the client — the server validates and returns the
// new balance/loadout, which we reflect locally.

import { applyCosmetics, applyLoadout } from './cosmeticsApply.js';

const MODAL_ID = 'shop-modal';
const SLOT_LABELS = {
    theme: 'Themes', bubble: 'Chat Bubbles', avatarFrame: 'Avatar Frames',
    board: 'Boards', calculator: 'Calculators', header: 'Headers',
};
const SLOT_ORDER = ['theme', 'bubble', 'avatarFrame', 'board', 'calculator', 'header'];

// Slots whose surface does not exist on a phone. The shop opens from the mobile
// chat, so without this a student browsing on their phone can spend 200 earned
// coins on a header skin that paints correctly and is then never visible —
// the header is display:none below 768px. The note is CSS-gated to that same
// breakpoint in shop.css: on desktop the slot works fine and the warning would
// be wrong. Prefer giving a slot a mobile surface over listing it here.
const SLOT_NOTES = {
    header: 'Headers show on desktop only — the header is hidden on phones.',
};

let state = { catalog: {}, coins: 0, owned: [], equipped: {} };
let preview = null; // { slot, id } while a "try-on" is active, else null
let undoTimer = null; // auto-hide timer for the post-purchase Undo bar
let revealUndo = null; // undoes a surface we opened for the preview, else null

// Most slots repaint something already on screen (theme, bubbles, header,
// avatar frame), so stamping the attribute is the whole preview. The calculator
// and the board are different: both are closed by default, so "Try it on"
// stamped a skin onto a hidden element and the student watched nothing happen —
// which reads as "this cosmetic is broken", not "open the calculator to see it".
// Reveal the surface a skin actually paints, and put it back on Done/Escape.
const SLOT_SURFACE = {
    calculator: () => {
        // Ask the calculator whether it's open rather than reading an element's
        // inline style: the shared component (js/mmCalculator.js) is created on
        // first use and toggles a class, so there is no element to inspect until
        // it exists, and no inline display once it does.
        const fc = window.floatingCalc;
        if (!fc?.showCalculator) return null;
        if (fc.isOpen && fc.isOpen()) return null; // already open — leave it
        fc.showCalculator();
        return () => fc.hideCalculator();
    },
    board: () => {
        const ws = window.MathWorkspace;
        if (!ws?.showTool) return null;
        const wasOpen = document.querySelector('.cr-ws-panel.is-open, .cr-ws.is-open');
        const prior = document.querySelector('.cr-ws-tab.is-active')?.getAttribute('data-tool');
        if (prior === 'board' && wasOpen) return null;
        ws.showTool('board');
        return () => {
            if (prior && prior !== 'board') ws.showTool(prior);
            if (!wasOpen && ws.close) ws.close();
        };
    },
};

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
      </div>
      <div class="shop-preview-bar" hidden>
        <span class="shop-preview-label" aria-live="polite"></span>
        <div class="shop-preview-actions">
          <button class="shop-btn shop-preview-action" type="button" data-preview-action></button>
          <button class="shop-btn shop-preview-done" type="button" data-preview-done>Done</button>
        </div>
      </div>
      <div class="shop-undo-bar" hidden role="status">
        <span class="shop-undo-label" aria-live="polite"></span>
        <button class="shop-btn shop-undo-btn" type="button" data-undo>↩ Undo</button>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-shop-close]').forEach(el => el.addEventListener('click', closeShop));
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || modal.hidden) return;
        // Escape backs out of a preview first, then closes the shop.
        if (preview) stopPreview(); else closeShop();
    });
    modal.querySelector('#shop-body').addEventListener('click', onBodyClick);
    modal.querySelector('[data-preview-done]').addEventListener('click', stopPreview);
    modal.querySelector('[data-preview-action]').addEventListener('click', onPreviewAction);
    modal.querySelector('[data-undo]').addEventListener('click', onUndo);
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
    'board.grid':      'repeating-linear-gradient(0deg,#123c78 0 5px,#3f6cb4 5px 6px)',
    'board.chalk':     '#2a3d33',
    'board.cheetah':   'radial-gradient(circle at 30% 30%,#5b3a1a 20%,transparent 21%),#eccf96',
    'calc.hotpink':    'linear-gradient(135deg,#ff5db1,#ff2e93)',
    'calc.carbon':     'linear-gradient(180deg,#d90429 0 12%,transparent 12%),repeating-linear-gradient(45deg,#2b2f36 0 4px,#23262c 4px 8px)',
    'header.camo':     'radial-gradient(circle at 30% 40%,#6b7d4f 30%,#5a6b42 31%)',
    'header.wave':     'linear-gradient(135deg,#4f46e5,#0284c7 55%,#0e7490)',
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
    // "Try on" is offered for anything not already equipped — students can see a
    // cosmetic live on their real screen before spending. Level-locked items can
    // still be previewed (try before you grind), just not bought yet.
    const tryOn = equipped ? '' :
        `<button class="shop-btn shop-btn-preview" data-act="preview" data-id="${esc(id)}">👀 Try it on</button>`;

    return `
      <div class="shop-item shop-rarity-${esc(item.rarity)}${preview && preview.id === id ? ' is-previewing' : ''}">
        ${swatchHTML(id, item.rarity)}
        <div class="shop-item-name">${esc(item.name)}</div>
        <div class="shop-item-rarity">${esc(item.rarity)}</div>
        ${action}
        ${tryOn}
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
        const note = SLOT_NOTES[slot]
            ? `<p class="shop-section-note">${esc(SLOT_NOTES[slot])}</p>` : '';
        return `<section class="shop-section">
                  <h3 class="shop-section-head">${esc(SLOT_LABELS[slot] || slot)}</h3>
                  ${note}
                  <div class="shop-grid">${items}</div>
                </section>`;
    }).join('');

    body.innerHTML = sections || `<div class="shop-empty">The shop is empty right now.</div>`;
}

async function onBodyClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'preview') { startPreview(btn.dataset.id); return; }
    btn.disabled = true;
    try {
        if (act === 'buy') {
            // "Are you sure?" — first tap arms the button, second tap buys.
            if (btn.dataset.armed !== '1') { armBuy(btn); return; }
            disarmBuy(btn);
            const id = btn.dataset.id;
            const item = state.catalog[id] || {};
            const res = await post('/api/cosmetics/purchase', { itemId: id });
            const data = await res.json();
            if (!res.ok || !data.success) return flash(btn, data.error === 'insufficient_coins' ? 'Not enough' : 'Failed');
            state.coins = data.coins;
            state.owned = data.owned || state.owned.concat(id);
            if (window.currentUser) { window.currentUser.wallet = window.currentUser.wallet || {}; window.currentUser.wallet.coins = data.coins; }
            render();
            showUndo(data.undo, item.name || 'that');
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

// ---- "Are you sure?" — a second tap confirms a spend --------------------
function armBuy(btn) {
    // Only one buy armed at a time.
    document.querySelectorAll('#shop-body [data-act="buy"][data-armed="1"]').forEach(disarmBuy);
    btn.dataset.armed = '1';
    btn.dataset.orig = btn.innerHTML;
    btn.classList.add('shop-btn-confirm');
    btn.innerHTML = 'Sure? Tap again';
    clearTimeout(btn._armTimer);
    btn._armTimer = setTimeout(() => disarmBuy(btn), 3500);
}
function disarmBuy(btn) {
    if (!btn) return;
    clearTimeout(btn._armTimer);
    if (btn.dataset.armed === '1' && btn.dataset.orig != null) btn.innerHTML = btn.dataset.orig;
    btn.dataset.armed = '';
    btn.classList.remove('shop-btn-confirm');
}

// ---- Undo the most recent purchase (server-authoritative refund) ---------
function showUndo(undo, itemName) {
    if (!undo || !undo.itemId) return;
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const bar = modal.querySelector('.shop-undo-bar');
    bar.dataset.itemId = undo.itemId;
    bar.querySelector('.shop-undo-label').textContent = `Bought ${itemName}.`;
    bar.querySelector('[data-undo]').innerHTML = `↩ Undo (🪙${undo.price} back)`;
    bar.querySelector('[data-undo]').disabled = false;
    bar.hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { bar.hidden = true; }, 12000);
}

async function onUndo() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const bar = modal.querySelector('.shop-undo-bar');
    const itemId = bar.dataset.itemId;
    if (!itemId) return;
    const btn = bar.querySelector('[data-undo]');
    btn.disabled = true;
    try {
        const res = await post('/api/cosmetics/refund', { itemId });
        const data = await res.json();
        if (!res.ok || !data.success) { btn.disabled = false; return flashEl(btn, data.error === 'window_expired' ? 'Too late' : 'Failed'); }
        state.coins = data.coins;
        state.owned = data.owned || state.owned.filter(x => x !== itemId);
        if (data.equipped) state.equipped = data.equipped;
        if (window.currentUser) {
            window.currentUser.wallet = window.currentUser.wallet || {};
            window.currentUser.wallet.coins = data.coins;
            if (data.equipped) window.currentUser.equippedCosmetics = data.equipped;
        }
        applyCosmetics(window.currentUser); // revert if the refunded item was equipped
        clearTimeout(undoTimer);
        bar.hidden = true;
        bar.dataset.itemId = '';
        render();
    } catch (err) {
        console.warn('Undo failed', err);
        btn.disabled = false;
        flashEl(btn, 'Error');
    }
}

// ---- Live "try on" preview ----------------------------------------------
// Stamps the previewed item onto the REAL page (via applyLoadout) and collapses
// the shop to a slim bar so the student sees their actual screen. Client-only —
// nothing is bought or equipped until they choose to. Reverts on Done/Escape/close.

function startPreview(id) {
    const item = state.catalog[id];
    if (!item) return;
    preview = { slot: item.slot, id };
    // Overlay the previewed item on top of the real equipped loadout.
    applyLoadout({ ...state.equipped, [item.slot]: id });
    try { revealUndo = SLOT_SURFACE[item.slot]?.() || null; }
    catch { revealUndo = null; } // a surface that isn't on this page is fine

    const modal = buildModal();
    modal.classList.add('shop-previewing');
    const bar = modal.querySelector('.shop-preview-bar');
    bar.querySelector('.shop-preview-label').textContent = `Previewing ${item.name}`;

    const actionBtn = bar.querySelector('[data-preview-action]');
    const owned = state.owned.includes(id);
    const level = (window.currentUser && window.currentUser.level) || 1;
    const locked = item.unlockLevel && level < item.unlockLevel && !owned;
    if (owned) {
        actionBtn.textContent = 'Equip this';
        actionBtn.className = 'shop-btn shop-btn-equip shop-preview-action';
        actionBtn.disabled = false;
    } else if (locked) {
        actionBtn.textContent = `🔒 Reach Level ${item.unlockLevel}`;
        actionBtn.className = 'shop-btn shop-btn-locked shop-preview-action';
        actionBtn.disabled = true;
    } else {
        const affordable = state.coins >= item.price;
        actionBtn.textContent = affordable ? `🪙 ${item.price} — Buy & wear` : `🪙 ${item.price} — need more`;
        actionBtn.className = 'shop-btn shop-btn-buy shop-preview-action';
        actionBtn.disabled = !affordable;
    }
    bar.hidden = false;
}

function stopPreview() {
    if (!preview) return;
    preview = null;
    if (revealUndo) { try { revealUndo(); } catch { /* surface already gone */ } }
    revealUndo = null;
    applyLoadout(state.equipped); // revert to what they actually own/equip
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.classList.remove('shop-previewing');
    modal.querySelector('.shop-preview-bar').hidden = true;
    render();
}

// Buy (if needed) then equip the previewed item, so a preview converts in one tap.
async function onPreviewAction() {
    if (!preview) return;
    const { slot, id } = preview;
    const owned = state.owned.includes(id);
    const item = state.catalog[id] || {};
    const bar = document.getElementById(MODAL_ID).querySelector('.shop-preview-bar');
    const actionBtn = bar.querySelector('[data-preview-action]');

    // Confirm before SPENDING. Equipping an item you already own needs no confirm.
    if (!owned && actionBtn.dataset.armed !== '1') {
        actionBtn.dataset.armed = '1';
        actionBtn.dataset.orig = actionBtn.textContent;
        actionBtn.textContent = 'Sure? Tap again';
        actionBtn.classList.add('shop-btn-confirm');
        clearTimeout(actionBtn._armTimer);
        actionBtn._armTimer = setTimeout(() => {
            actionBtn.dataset.armed = '';
            actionBtn.classList.remove('shop-btn-confirm');
            if (actionBtn.dataset.orig != null) actionBtn.textContent = actionBtn.dataset.orig;
        }, 3500);
        return;
    }
    clearTimeout(actionBtn._armTimer);
    actionBtn.dataset.armed = '';
    actionBtn.classList.remove('shop-btn-confirm');
    actionBtn.disabled = true;

    let undo = null;
    try {
        if (!owned) {
            const res = await post('/api/cosmetics/purchase', { itemId: id });
            const data = await res.json();
            if (!res.ok || !data.success) { actionBtn.disabled = false; return flashEl(actionBtn, data.error === 'insufficient_coins' ? 'Not enough' : 'Failed'); }
            state.coins = data.coins;
            state.owned = data.owned || state.owned.concat(id);
            undo = data.undo;
            if (window.currentUser) { window.currentUser.wallet = window.currentUser.wallet || {}; window.currentUser.wallet.coins = data.coins; }
        }
        const res = await post('/api/cosmetics/equip', { slot, itemId: id });
        const data = await res.json();
        if (!res.ok || !data.success) { actionBtn.disabled = false; return flashEl(actionBtn, 'Failed'); }
        state.equipped = data.equipped || { ...state.equipped, [slot]: id };
        if (window.currentUser) window.currentUser.equippedCosmetics = state.equipped;
        // It's now really equipped — keep it on screen and close the preview.
        // Any surface we opened to show the try-on stays open too: they just
        // bought this, so seeing it is the point. Drop the undo so a later
        // preview can't close a surface this one revealed.
        preview = null;
        revealUndo = null;
        applyCosmetics(window.currentUser);
        const modal = document.getElementById(MODAL_ID);
        modal.classList.remove('shop-previewing');
        bar.hidden = true;
        render();
        if (undo) showUndo(undo, item.name || 'that');
    } catch (err) {
        console.warn('Preview purchase/equip failed', err);
        actionBtn.disabled = false;
        flashEl(actionBtn, 'Error');
    }
}

function flashEl(btn, msg) {
    const orig = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = orig; }, 1200);
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
        // A purchase from a moment ago is still undoable — surface it on open.
        if (data.undo) showUndo(data.undo, state.catalog[data.undo.itemId]?.name || 'that');
        else { const bar = modal.querySelector('.shop-undo-bar'); if (bar) bar.hidden = true; }
    } catch (err) {
        console.warn('Shop load failed', err);
        modal.querySelector('#shop-body').innerHTML = `<div class="shop-empty">Couldn't load the shop. Try again.</div>`;
    }
}

export function closeShop() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    if (preview) stopPreview(); // revert a live try-on before leaving
    modal.classList.remove('shop-open');
    setTimeout(() => { modal.hidden = true; }, 200);
}

if (typeof window !== 'undefined') {
    window.openShop = openShop;
    window.closeShop = closeShop;
}
