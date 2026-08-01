/* ============================================================
   chatCalculator.js — chat's host for the shared calculator.
   ============================================================
   Replaces floating-calculator.js (1,697 lines of TI-84 emulation). The
   calculator itself is now js/mmCalculator.js; everything left here is the
   part that was genuinely chat-specific:

     - the teacher's classroom rule (GET /api/calculator/access)
     - the three entry points, and making 'never' remove ALL of them
     - "Send result to chat"
     - window.floatingCalc, kept as the public name because workspace.js,
       modules/shop.js and modules/iep.js all reach for it

   Availability rules are unchanged from the version this replaces: available
   by default in tutor chat AND course chat (one page, so one calculator), and
   the access check fails OPEN — restricting a class is a deliberate act by a
   teacher, never something a dropped request does by accident.
   ============================================================ */

(function () {
  'use strict';

  const TITLES = {
    'skill-based': 'Calculator (use for complex calculations only)',
    'teacher-discretion': 'Calculator (teacher discretion)',
  };

  let calc = null;
  let access = 'always';

  function entryPoints() {
    return [
      document.getElementById('calculator-toolbar-btn'),
      document.getElementById('toggle-calculator-btn'),
      document.getElementById('sidebar-calculator-btn'),
    ].filter(Boolean);
  }

  /** Type the calculator's result into the composer, as if the student had. */
  function sendToChat(value) {
    const input = document.getElementById('user-input');
    if (!input) return;
    const existing = (input.textContent || '').trim();
    input.textContent = existing ? existing + ' ' + value : value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  function build() {
    if (calc) return calc;
    calc = window.MMCalculator.create({
      variant: 'float',
      backdrop: true,
      keyboard: true,
      onSendToChat: sendToChat,
    });
    calc.mount(document.body);
    return calc;
  }

  function applyAccessRestrictions() {
    const allowed = access !== 'never';
    const title = TITLES[access] || 'Calculator';

    for (const el of entryPoints()) {
      el.style.display = allowed ? '' : 'none';
      if (allowed) el.title = title;
    }

    // The Workspace's Calc tab is a third entry point, and it used to survive
    // a 'never' policy: the tab stayed in the rail and its "Open calculator"
    // button silently did nothing. A rule that removes the calculator has to
    // remove every way in, or the restriction just reads as a broken button.
    const calcTab = document.querySelector('.cr-ws-tab[data-tool="calc"]');
    if (calcTab) {
      calcTab.hidden = !allowed;
      if (!allowed && calcTab.classList.contains('is-active') &&
        window.MathWorkspace?.showTool) {
        window.MathWorkspace.showTool('board');
      }
    }

    if (!allowed && calc) calc.hide();
  }

  // Fails OPEN on every failure path: a 404, a 500, an offline blip or a
  // malformed body all leave access at 'always'. Note the route's own error
  // path returns {success:false}, so treating that as a restriction would let
  // a server error quietly take the calculator away from a whole class.
  async function checkAccess() {
    try {
      const res = await fetch('/api/calculator/access');
      const data = await res.json();
      if (data && data.success && data.calculatorAccess) access = data.calculatorAccess;
    } catch (err) {
      console.warn('Could not check calculator access — leaving it available:', err);
    } finally {
      applyAccessRestrictions();
    }
  }

  const api = {
    showCalculator() { if (access === 'never') return; build().show(); },
    hideCalculator() { if (calc) calc.hide(); },
    toggleCalculator() { if (access === 'never') return; build().toggle(); },
    isOpen() { return !!calc && calc.isOpen(); },
    get calculatorAccess() { return access; },
  };

  function init() {
    if (window.floatingCalc) return;
    window.floatingCalc = api;
    for (const el of entryPoints()) {
      el.addEventListener('click', () => api.toggleCalculator());
    }
    checkAccess();
  }

  // A dynamically injected script can finish loading after DOMContentLoaded,
  // at which point a bare listener never fires and every entry point becomes a
  // button that does nothing. Check readyState instead of assuming we won.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
