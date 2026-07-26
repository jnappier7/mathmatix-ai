/* ============================================================
   chat-workspace.js — flag-gated integration of the Living
   Workspace INTO the live chat (spec milestone M-B: "new surface
   beside the old board, proven before swapping").

   Default = OFF: this file loads on chat.html but does NOTHING unless
   the LivingWorkspace flag is dev|beta|live. So the normal chat
   experience (old board) is untouched, and none of the ~10 workspace
   scripts are even fetched.

   When ON (window.MM_FEATURES.livingWorkspace or ?livingWorkspace=dev):
     1. lazily inject the workspace CSS + UMD-lite modules (KaTeX/
        MathLive are already on the chat page — reused, not re-loaded),
     2. mount the shell into a self-contained, dismissible dev panel
        (its own container — it never touches the old board's DOM, so
        it can't break the live layout),
     3. expose window.LWS_CHAT.applyBoardCommands(cmds): the chat SSE
        handler feeds each turn's board_commands here; the P5 adapter
        turns them into workspace elements that render on the surface.

   This is a preview harness in the real app, not the swap. Turning the
   old board off / making this the default is a later milestone.
   ============================================================ */
(function () {
  'use strict';

  // ── Lightweight flag read (no dependency on flags.js, which we may not
  //    have loaded yet). Mirrors core/flags.js precedence. ──
  function resolveMode() {
    try {
      var qs = new URLSearchParams(window.location.search || '');
      var q = qs.get('livingWorkspace');
      if (q) return q;
    } catch (_) { /* no URL */ }
    var f = window.MM_FEATURES && window.MM_FEATURES.livingWorkspace;
    return f || 'off';
  }
  var MODE = resolveMode();
  var ON = MODE === 'dev' || MODE === 'beta' || MODE === 'live';

  // Chat context for the student-move loop (P7). Chat refines it via
  // window.LWS_CHAT.setContext({ conversationId, workspaceId }).
  var ctx = { conversationId: null, workspaceId: 'chat' };

  // Public surface is always defined so callers don't need to feature-detect
  // twice; when off, applyBoardCommands is a no-op.
  var api = {
    isOn: function () { return ON; },
    applyBoardCommands: function () {},
    applyVoiceBoard: function () {},
    // Voice caption/spotlight hooks — see derivationView.setSpeaking. No-ops
    // until the view mounts, so the caption layer can call them unguarded.
    setSpeaking: function () {},
    setCaption: function () {},
    setContext: function (c) { if (c && typeof c === 'object') { if (c.conversationId != null) ctx.conversationId = c.conversationId; if (c.workspaceId != null) ctx.workspaceId = c.workspaceId; } },
    // Wipe the board back to its empty state, thumbnail rail included. Called
    // when the server rolls the conversation over after an idle gap — the new
    // session must not open onto the previous one's work.
    reset: function () {},
    // Rebuild the board from a persisted conversation.boardLedger (session
    // switch / page re-mount). No-op when the workspace is off.
    hydrate: function () {},
    // Source Cards (spec §5.1): set the dock from a conversation's messages
    // (history load) or append this turn's uploads (live delta).
    setSourcesFromMessages: function () {},
    addSources: function () {},
    // Source↔problem link (spec §5.4): paint/clear the in-focus problem's
    // "from my worksheet" chip. Fed by the response's boardSource field.
    setProblemSource: function () {},
  };
  window.LWS_CHAT = api;
  if (!ON) return;

  // Cache-buster for the lazily-loaded workspace CSS + modules. prod serves
  // public/ with a 7-day cache and no content hashing, so bump this whenever
  // any living-workspace asset changes (and the chat.html <script ?v=> tag to
  // match, so this file itself refreshes). See project_asset_cache_busting.
  var ASSET_V = '?v=20260725e';
  var BASE = '/js/living-workspace/';
  var SCRIPTS = [
    'core/flags.js', 'core/viewport.js', 'core/elementRegistry.js',
    'core/snapshotManager.js', 'core/a11yCommands.js', 'core/ledgerReplay.js',
    'core/sourceList.js', 'dom/sourceDock.js',
    'dom/gridRenderer.js', 'dom/overlayManager.js', 'dom/equationElement.js',
    'dom/tileElement.js', 'dom/numberLineElement.js', 'dom/graphElement.js',
    'dom/noteElement.js', 'dom/imageElement.js', 'dom/studentMoveClient.js',
    'dom/interactionController.js', 'dom/shell.js', 'dom/legacyBoardAdapter.js',
    'dom/derivationView.js', 'dom/voiceBoardTranslate.js',
  ];

  // Build brick #1: the chat board renders as a FOCUSED DERIVATION
  // (dom/derivationView.js), not free-floating canvas cards. `dv` is that view.
  var dv = null;
  var dock = null;           // SourceDock — uploads living on the board
  var ready = false;
  var pending = null;        // latest board_commands received before ready
  var pendingLedger;         // ledger passed to hydrate() before ready (undefined = none)
  var pendingSources;        // source list set before ready (undefined = none)
  var turn = 0;

  function injectCss() {
    if (document.querySelector('link[data-lws]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/css/living-workspace.css' + ASSET_V; link.dataset.lws = '1';
    document.head.appendChild(link);
  }

  // Sequential loader: each script executes before the next, so UMD-lite
  // deps (viewport before shell, etc.) resolve in order.
  function loadNext(i, done) {
    if (i >= SCRIPTS.length) return done();
    var s = document.createElement('script');
    s.src = BASE + SCRIPTS[i] + ASSET_V;
    s.async = false;
    s.onload = function () { loadNext(i + 1, done); };
    s.onerror = function () { console.error('[LWS_CHAT] failed to load', s.src); };
    document.body.appendChild(s);
  }

  // THE SWAP (M-C): take over the chat's board region in-layout. Hide the old
  // board's contents inside #cr-workspace and mount the new surface there, so
  // the workspace IS the board (not a floating preview). Reversible — flag off
  // leaves #cr-workspace untouched; the hidden nodes are still in the DOM.
  // Falls back to a floating panel when #cr-workspace is absent (dev harnesses,
  // other pages) so the integration still works anywhere.
  function buildPanel() {
    var region = document.getElementById('cr-workspace');
    if (region) {
      region.classList.add('lws-swapped');
      // Hide the old tabbed board tools, keep them in the DOM (reversible).
      // EXCEPTIONS that stay visible: the student player card / progress switcher
      // (#cr-player-card, pinned to the bottom of the rail) and the "My Progress"
      // profile overlay (#psc-profile). Both belong to the rail, not the legacy
      // board. #psc-profile is created by playerStatsCard.js AFTER the /user
      // fetch, which can race ahead of this swap — if it does, this loop would
      // stamp inline display:none on it and the panel could never paint, no
      // matter what the toggle does. Skipping it here keeps the toggle honest.
      for (var i = 0; i < region.children.length; i++) {
        var cid = region.children[i].id;
        if (cid === 'cr-player-card' || cid === 'psc-profile') continue;
        region.children[i].setAttribute('data-lws-hidden', '1');
        region.children[i].style.display = 'none';
      }
      var mountIn = document.createElement('div');
      mountIn.id = 'lws-chat-mount';
      mountIn.style.cssText = 'position:absolute;inset:0;';
      if (getComputedStyle(region).position === 'static') region.style.position = 'relative';
      region.appendChild(mountIn);
      // Way back to chat. On mobile the swapped workspace is a FULL-SCREEN
      // drawer, and the old close X is hidden with the rest of the legacy board
      // chrome — leaving phone students with no exit. A dedicated, clearly
      // labeled "‹ Chat" pill fixes that. Deliberately TOP-LEFT: the
      // derivation's own text-size control (.lws-dv-az) floats top-right, so the
      // right corner is taken. Appended after the mount (and z-index'd in CSS)
      // so it sits above the board; shown only on the mobile drawer (CSS), since
      // on desktop the workspace is a persistent column that needs no exit.
      var exit = document.createElement('button');
      exit.type = 'button';
      exit.className = 'lws-chat-exit';
      exit.setAttribute('aria-label', 'Close workspace and return to chat');
      exit.innerHTML = '<i class="fas fa-chevron-left" aria-hidden="true"></i><span>Chat</span>';
      exit.addEventListener('click', function () {
        if (window.MathWorkspace && typeof window.MathWorkspace.close === 'function') {
          window.MathWorkspace.close();
        }
      });
      region.appendChild(exit);
      return mountIn;
    }

    // Fallback: floating dev panel.
    var panel = document.createElement('div');
    panel.id = 'lws-chat-panel';
    panel.setAttribute('aria-label', 'Living Workspace (preview)');
    panel.style.cssText = [
      'position:fixed', 'top:72px', 'right:16px', 'bottom:16px',
      'width:min(46vw,640px)', 'z-index:2200',
      'background:var(--cr-bg-panel,#fff)', 'border:1px solid rgba(15,26,36,0.12)',
      'border-radius:16px', 'box-shadow:0 12px 40px rgba(15,26,36,0.18)',
      'display:flex', 'flex-direction:column', 'overflow:hidden',
    ].join(';');

    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid rgba(15,26,36,0.1);font:600 12px/1 Inter,system-ui,sans-serif;color:#5B6876;';
    bar.innerHTML = '<span>🧪 Living Workspace <span style="opacity:.7">(' + MODE + ' preview)</span></span>';
    var close = document.createElement('button');
    close.type = 'button'; close.textContent = '×';
    close.setAttribute('aria-label', 'Hide workspace preview');
    close.style.cssText = 'border:none;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:#5B6876;';
    close.addEventListener('click', function () { panel.style.display = 'none'; });
    bar.appendChild(close);

    var mount = document.createElement('div');
    mount.id = 'lws-chat-mount';
    mount.style.cssText = 'flex:1;min-height:0;position:relative;';

    panel.appendChild(bar);
    panel.appendChild(mount);
    document.body.appendChild(panel);
    return mount;
  }

  // Renderers for the inline blocks the derivation embeds. Equation-family
  // lines (pose/resolve/apply/verify/scaffold/example) are typeset directly by
  // the view; only graph / image / geometry need a renderer, and those are the
  // only non-equation element types board_commands ever produce via the P5
  // adapter (tiles / number lines are never emitted by board_commands, so the
  // derivation needs no student-move loop).
  function makeRenderers() {
    var r = {};
    if (window.LWS.GraphElement) {
      r.graph = window.LWS.GraphElement.makeRenderer({ onChange: function () { /* exploration only; no answer injection */ } });
    }
    // Image (P15): real safe-search picture, degrading to a labelled note.
    if (window.LWS.ImageElement) r.image = window.LWS.ImageElement.makeRenderer();
    else if (window.LWS.NoteElement) r.image = window.LWS.NoteElement.makeRenderer();
    // Geometry (P17): titled note card until a real figure renderer lands.
    if (window.LWS.NoteElement) r.geometry = window.LWS.NoteElement.makeRenderer();
    return r;
  }

  // Render one turn's board_commands onto the surface via the P5 adapter.
  // Render one turn's board_commands as derivation items. The P5 adapter maps
  // commands → elements (role-tagged); the derivation view lays them out
  // (problem pinned, steps flowing, graph/image inline). `clear` wipes first.
  function render(cmds) {
    if (!ready || !dv) { pending = cmds; return; }
    var out;
    try { out = window.LWS.adaptBoardCommands(cmds, { idPrefix: 'lgc' + (++turn) }); }
    catch (e) { console.error('[LWS_CHAT] adapt failed', e); return; }
    try { dv.apply(out.elements, out.clear); }
    catch (e) { console.error('[LWS_CHAT] render failed', e); }
  }

  api.applyBoardCommands = function (cmds) {
    if (!Array.isArray(cmds) || cmds.length === 0) return;
    render(cmds);
  };

  // Voice turns speak the legacy board protocol (mathSteps / boardActions).
  // Translate to boardCommands and render, so the derivation view updates live
  // during a voice session instead of freezing after the first (text-posed)
  // problem. No-op if the translator or payload is empty.
  api.applyVoiceBoard = function (payload) {
    if (!window.LWS || typeof window.LWS.voiceToBoardCommands !== 'function') return;
    var cmds;
    try { cmds = window.LWS.voiceToBoardCommands(payload); }
    catch (e) { console.error('[LWS_CHAT] voice translate failed', e); return; }
    if (Array.isArray(cmds) && cmds.length) render(cmds);
  };

  api.setSpeaking = function (on) {
    if (!dv) return;
    try { dv.setSpeaking(on); } catch (_) { /* view torn down */ }
  };

  api.setCaption = function (text) {
    if (!dv) return;
    try { dv.setCaption(text); } catch (_) { /* view torn down */ }
  };

  api.reset = function () {
    pending = null;                 // don't let a queued turn repaint the old session
    pendingLedger = undefined;
    pendingSources = undefined;
    if (dock) { try { dock.clear(); } catch (e) { console.error('[LWS_CHAT] dock clear failed', e); } }
    if (!dv) return;
    try { dv.resetAll(); } catch (e) { console.error('[LWS_CHAT] reset failed', e); }
  };

  var sources = [];
  function paintSources() {
    if (!dock) return;
    try { dock.setSources(sources); } catch (e) { console.error('[LWS_CHAT] dock render failed', e); }
  }

  // History load: the full source list derives from messages[].attachments.
  // Replaces whatever the dock held — a switch means a different conversation.
  api.setSourcesFromMessages = function (messages) {
    if (!window.LWS || typeof window.LWS.sourcesFromMessages !== 'function') { pendingSources = messages || []; return; }
    sources = window.LWS.sourcesFromMessages(messages);
    if (!ready) { pendingSources = messages || []; return; }
    paintSources();
  };

  // Live turn: the response's sourceUploads delta appends to the dock.
  api.addSources = function (delta) {
    if (!Array.isArray(delta) || !delta.length) return;
    if (!window.LWS || typeof window.LWS.mergeSources !== 'function' || !ready) return;
    sources = window.LWS.mergeSources(sources, delta);
    paintSources();
  };

  api.setProblemSource = function (ref) {
    if (!ready || !dv) return;
    try { dv.setProblemSource(ref || null); } catch (e) { console.error('[LWS_CHAT] problem source failed', e); }
  };

  // The problem header's chip → reopen the docked source with the problem's
  // region highlighted. Falls back to a bare open when the source has scrolled
  // off the dock (older than the cap) — the ref still names it servably.
  function openLinkedSource(ref) {
    if (!dock || !ref || !ref.uploadId) return;
    var src = null;
    for (var i = 0; i < sources.length; i++) {
      if (sources[i] && sources[i].uploadId === ref.uploadId) { src = sources[i]; break; }
    }
    if (!src) src = { uploadId: ref.uploadId, fileType: 'image', mimeType: null };
    try { dock.openSource(src, 'My worksheet', ref.region || null); }
    catch (e) { console.error('[LWS_CHAT] open linked source failed', e); }
  }

  // A confirmed region selection: the crop goes to the tutor as a normal chat
  // photo turn (OCR, diagnose, the works) tagged with the source ref so the
  // posed problem links back to the worksheet (spec §5.3–5.4).
  function askAboutRegion(file, region, src) {
    if (typeof window.mmAskAboutRegion !== 'function') { console.error('[LWS_CHAT] mmAskAboutRegion unavailable'); return; }
    window.mmAskAboutRegion(
      file,
      "Here's a problem from my worksheet — can we work on this one?",
      { uploadId: src.uploadId, region: region }
    );
  }

  // Rebuild the board from a persisted conversation.boardLedger: each finished
  // problem replays and is parked on the rail, the in-progress one lands in
  // focus. Replays run through the SAME adapter/render path as live turns, so
  // hydration can't drift from live behavior. hydrate(null) is a plain reset
  // (a conversation with no board history must show an empty board).
  function doHydrate(ledger) {
    try { dv.resetAll(); } catch (e) { console.error('[LWS_CHAT] hydrate reset failed', e); }
    if (!ledger || typeof window.LWS.ledgerToTurns !== 'function') return;
    var turns;
    try { turns = window.LWS.ledgerToTurns(ledger); }
    catch (e) { console.error('[LWS_CHAT] ledger replay failed', e); return; }
    turns.forEach(render);
    // Commands can't carry per-problem metadata (assistance level etc.) —
    // zip it onto the rail entries the replay just produced.
    if (typeof window.LWS.ledgerMeta === 'function') {
      try { dv.annotateArchive(window.LWS.ledgerMeta(ledger)); }
      catch (e) { console.error('[LWS_CHAT] archive annotate failed', e); }
    }
    // The in-focus problem's source link survives the reload too.
    if (ledger.current && ledger.current.sourceRef) {
      try { dv.setProblemSource(ledger.current.sourceRef); }
      catch (e) { console.error('[LWS_CHAT] hydrate problem source failed', e); }
    }
  }

  api.hydrate = function (ledger) {
    pending = null;                 // queued live turns belong to the old view
    if (!ready || !dv) { pendingLedger = ledger || null; return; }
    doHydrate(ledger);
  };

  function boot() {
    injectCss();
    loadNext(0, function () {
      if (!window.LWS || !window.LWS.DerivationView) { console.error('[LWS_CHAT] DerivationView not available after load'); return; }
      var mount = buildPanel();
      dv = new window.LWS.DerivationView(mount, { renderers: makeRenderers(), onOpenSource: openLinkedSource });
      if (window.LWS.SourceDock) {
        try { dock = new window.LWS.SourceDock(mount, { onAskRegion: askAboutRegion }); } catch (e) { console.error('[LWS_CHAT] dock mount failed', e); }
      }
      ready = true;
      if (pendingSources !== undefined) { var ps = pendingSources; pendingSources = undefined; api.setSourcesFromMessages(ps); }
      // Queued work replays in arrival order: hydrate() clears any turn queued
      // before it, so a `pending` that is still set alongside a pendingLedger
      // arrived AFTER the hydrate and renders on top of the rebuilt board.
      if (pendingLedger !== undefined) { var l = pendingLedger; pendingLedger = undefined; doHydrate(l); }
      if (pending) { var p = pending; pending = null; render(p); }
      console.log('[LWS_CHAT] mounted (derivation, mode=' + MODE + ')');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
