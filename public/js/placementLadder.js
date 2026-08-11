/**
 * THE PLACEMENT LADDER — renderer.
 *
 * Draws the payload from utils/placementLadder.js: one rung per course band,
 * lit by what the student owns. This replaces the grade-level card that used to
 * headline the Starting Point results on both surfaces (the standalone
 * screener page and the in-chat FloatingScreener), so it has to look right in a
 * full-width card and in a ~380px floating panel.
 *
 * Rendered top-down in the DOM (highest band first) so it READS as a climb —
 * what is left is above you, what you own is below. Same choice, and the same
 * reason, as renderLadder() in skill-map.js: reversing in markup rather than
 * with flex-direction keeps tab and screen-reader order matching visual order.
 *
 * Pure copy logic is split out and exported so it can be unit-tested; the rest
 * is DOM. Loads as a browser global and as a CommonJS module (for jest).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlacementLadder = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * The headline sentence.
   *
   * Leads with the total the student OWNS, because that is the number the old
   * grade level was hiding. Proved and cleared are then named separately — a
   * cleared skill was not demonstrated, and rolling the two together to make
   * the number bigger would be the board claiming evidence it does not have.
   */
  function lede(totals) {
    const t = totals || {};
    const owned = t.owned || 0;
    // 'taught' is owned-and-demonstrated too; count it with proved rather than
    // dropping it, or a student who taught a skill back watches it vanish.
    const shown = (t.proved || 0) + (t.taught || 0);
    const cleared = t.assumed || 0;

    if (!owned) {
      return 'This is the ground floor — we build from here. '
        + 'Nothing on this ladder is a verdict: prove anything out the moment you are ready.';
    }
    if (!cleared) {
      return 'You already own ' + count(owned, 'skill') + ', every one of them proved outright.';
    }
    if (!shown) {
      return 'You already own ' + count(owned, 'skill') + ', cleared by what sits above them.';
    }
    return 'You already own ' + count(owned, 'skill') + ' — '
      + shown + ' you proved, and ' + cleared + ' that cleared beneath them.';
  }

  function count(n, noun) {
    return n + ' ' + noun + (n === 1 ? '' : 's');
  }

  /**
   * Is there anything honest to draw?
   *
   * Split out from render() and exported because it is a decision, not
   * painting: both callers fall back to the old grade-level card when this is
   * false, and a blank hero would be worse than the number it replaced. The
   * repo has no jsdom, so the DOM below is not unit-tested — this is.
   */
  function canRender(ladder) {
    return !!(ladder && ladder.seeded && ladder.rungs && ladder.rungs.length);
  }

  /**
   * Does this band get its skills drawn out pip by pip?
   *
   * Bands the student has reached, plus the one they are working in — so the
   * lit mass is the thing you see, and the untouched climb above stays a
   * skyline rather than a wall. A band with a single cleared skill still
   * qualifies: that one lit pip is the point.
   */
  function showPips(rung) {
    if (!rung || !rung.skills || !rung.skills.length) return false;
    return rung.owned > 0 || rung.learned > 0 || !!rung.isEdge;
  }

  /**
   * How wide each fill runs, as a percentage of the band.
   *
   * Linear over the band total, so the filled length IS the fraction owned.
   * Proved and cleared are separate bars because they are separate claims.
   */
  function fillWidths(rung) {
    const total = (rung && rung.total) || 0;
    if (!total) return { proved: 0, assumed: 0 };
    return {
      proved: ((rung.proved + rung.taught) / total) * 100,
      assumed: (rung.assumed / total) * 100
    };
  }

  /**
   * The skills on this rung the student can actually start right now.
   *
   * `open` means every prerequisite is done, `learned` means it is already
   * underway — both are genuinely startable. Nothing aspirational: a locked
   * skill in a "pick your next one" list is a wall dressed as a choice.
   *
   * Skills cleared from above are deliberately absent. There are hundreds of
   * them after a placement cascade, they would swamp the frontier, and their
   * only honest action is proving out — which the note at the bottom already
   * offers for anything on the board.
   */
  function startable(rung) {
    return ((rung && rung.skills) || []).filter(function (s) {
      return s.state === 'open' || s.state === 'learned';
    });
  }

  /**
   * Paint the ladder into `host`.
   *
   * @param {HTMLElement} host
   * @param {Object} ladder  payload from POST /api/screener/complete
   * @param {Object} [handlers]
   * @param {Function} [handlers.onLearn]  (skill) => void — student picked it to learn
   * @param {Function} [handlers.onProve]  (skill) => void — student says they know it
   * @returns {boolean} false when there was nothing honest to draw, so the
   *                    caller can fall back rather than leave a blank hero.
   */
  function render(host, ladder, handlers) {
    if (!host || !canRender(ladder)) return false;

    const acts = handlers || {};
    const pickable = !!acts.onLearn;

    host.textContent = '';
    host.classList.add('pl');
    // Hosts that pass no handlers stay a pure display, which is what the
    // fallback and any read-only embed want.
    host.classList.toggle('pl-pickable', pickable);

    const intro = el('p', 'pl-lede');
    intro.textContent = lede(ladder.totals);
    host.appendChild(intro);

    if (pickable) {
      const ask = el('p', 'pl-ask');
      ask.textContent = 'Pick where you go next — anything highlighted is ready for you now.';
      host.appendChild(ask);
    }

    const list = el('ol', 'pl-rungs');
    list.setAttribute('aria-label', 'What you already know, by course band');

    ladder.rungs.slice().reverse().forEach(function (rung) {
      list.appendChild(renderRung(rung, acts));
    });
    host.appendChild(list);

    host.appendChild(renderLegend());

    // The line the skill map has carried since it shipped, and the reason this
    // screen can afford to show a placement at all: a screener is an estimate,
    // and the kid who had a bad day is exactly the one who needs to know they
    // can prove out of anything on it.
    const note = el('p', 'pl-note');
    note.innerHTML = '<b>This is a starting guess, not a verdict.</b> '
      + 'A test can miss what you know — a bad day, a careless slip, a topic you '
      + 'learned under a different name. Anything here you already know, prove it '
      + 'and skip straight past it.';
    host.appendChild(note);

    return true;
  }

  function renderRung(rung, acts) {
    const li = el('li', 'pl-rung is-' + rung.state + (rung.isEdge ? ' is-edge' : ''));

    const head = el('div', 'pl-rung-head');
    const label = el('span', 'pl-rung-label');
    label.textContent = rung.label;
    const tally = el('span', 'pl-rung-tally');
    // Owned-of-total, not a percentage. "12 of 40" is a countable claim a
    // student can check against the map; "30%" is a grade in disguise.
    tally.textContent = rung.owned + ' of ' + rung.total;
    head.appendChild(label);
    head.appendChild(tally);
    li.appendChild(head);

    // Two stacked fills in one track: proved first, then cleared.
    const widths = fillWidths(rung);
    const track = el('div', 'pl-track');
    const provedBar = el('i', 'pl-fill pl-fill-proved');
    provedBar.style.width = widths.proved + '%';
    const clearedBar = el('i', 'pl-fill pl-fill-assumed');
    clearedBar.style.width = widths.assumed + '%';
    track.appendChild(provedBar);
    track.appendChild(clearedBar);
    li.appendChild(track);

    // One pip per skill — this is the "light up everything you own" of it.
    //
    // But ONLY on bands the student has reached. Drawn everywhere, the bands
    // above the student are five solid blocks of grey sitting on top of the
    // card, and the first thing the eye lands on is 250 things not done. That
    // is the grade level's message again in a bigger font, which is the exact
    // thing this screen exists to stop saying. Bands still ahead keep their
    // rung, their label and their true size — you can see where the ladder
    // goes — they just do not get to be the loudest thing on it.
    if (showPips(rung)) {
      const pips = el('div', 'pl-pips');
      // Decorative in the accessibility tree: a screen reader reading 60 pips
      // per band is noise, and the li's label below says the same thing once.
      pips.setAttribute('aria-hidden', 'true');
      rung.skills.forEach(function (s) {
        const pip = el('i', 'pl-pip s-' + s.state);
        pip.title = s.label + ' — ' + (STATE_WORD[s.state] || s.state);
        pips.appendChild(pip);
      });
      li.appendChild(pips);
    }

    if (rung.isEdge) {
      const here = el('span', 'pl-here');
      here.textContent = 'working here';
      head.appendChild(here);
    }

    // Picks follow the WORK, not the pip rule.
    //
    // Tying them to reached-bands-plus-edge looked tidier and stranded people:
    // a student who finishes every skill in their top band owns nothing in the
    // band above, so it is neither reached nor the edge, and the ladder would
    // offer them nothing at all at the exact moment they earned the next step.
    // An open skill has all its prerequisites done by definition — if a band
    // holds one, it is reachable and worth offering.
    const picks = acts && acts.onLearn ? startable(rung) : [];
    if (picks.length) {
      // …and a band with work waiting in it is not "ahead" of the student, so
      // it does not get dimmed like the untouched climb above.
      li.classList.add('has-picks');
      li.appendChild(renderPicks(picks, acts));
    }

    li.setAttribute('aria-label', rungSentence(rung));
    return li;
  }

  /**
   * The choosing part: every startable skill on this rung, by name.
   *
   * Named buttons, not the pips. A pip is 8px — fine as a unit of "how much do
   * I own", useless as a tap target on the Chromebooks and phones this runs on,
   * and it does not say what the skill IS. A student choosing their next step
   * needs to read the choice.
   *
   * Two actions per skill, mirroring the skill map's rungs: start the lesson,
   * or claim you already know it and prove out. The second is the one that
   * makes the placement note true rather than decorative.
   */
  // How many choices a rung shows before folding the rest behind a toggle.
  //
  // Every open skill at once is 28 buttons and a card five screens tall — that
  // is not a chooser, it is a menu you close. The cap is per rung so the
  // frontier and the foundations each keep a visible handful, and the toggle
  // means nothing is more than one tap away.
  const PICK_PREVIEW = 3;

  function renderPicks(picks, acts, expanded) {
    const wrap = el('div', 'pl-picks');
    const shown = expanded ? picks : picks.slice(0, PICK_PREVIEW);

    const heading = el('p', 'pl-picks-head');
    heading.textContent = picks.length === 1
      ? 'Ready for you now'
      : 'Ready for you now — ' + picks.length + ' to choose from';
    wrap.appendChild(heading);

    const ul = el('ul', 'pl-pick-list');
    shown.forEach(function (skill) {
      const item = el('li', 'pl-pick');

      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'pl-pick-go';
      go.innerHTML = '<span class="pl-pick-label"></span>'
        + '<span class="pl-pick-sub">' + (skill.state === 'learned' ? 'Keep going' : 'Learn it') + '</span>';
      go.querySelector('.pl-pick-label').textContent = skill.label;
      go.addEventListener('click', function () { acts.onLearn(skill); });
      item.appendChild(go);

      if (acts.onProve) {
        const prove = document.createElement('button');
        prove.type = 'button';
        prove.className = 'pl-pick-prove';
        prove.innerHTML = '<b>I know this</b><span>Prove it</span>';
        prove.setAttribute('aria-label', 'I already know ' + skill.label + ' — prove it and skip past it');
        prove.addEventListener('click', function () { acts.onProve(skill); });
        item.appendChild(prove);
      }

      ul.appendChild(item);
    });

    wrap.appendChild(ul);

    if (picks.length > PICK_PREVIEW) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'pl-pick-more';
      more.textContent = expanded
        ? 'Show fewer'
        : 'Show all ' + picks.length + ' ready here';
      more.addEventListener('click', function () {
        wrap.replaceWith(renderPicks(picks, acts, !expanded));
      });
      wrap.appendChild(more);
    }

    return wrap;
  }

  /** What a rung says out loud, for screen readers and for the pip tooltips. */
  function rungSentence(rung) {
    const parts = [rung.label + ': ' + rung.owned + ' of ' + rung.total + ' skills owned'];
    const shown = rung.proved + rung.taught;
    if (shown) parts.push(shown + ' proved');
    if (rung.assumed) parts.push(rung.assumed + ' cleared from above');
    if (rung.isEdge) parts.push('you are working here');
    return parts.join(', ') + '.';
  }

  var STATE_WORD = {
    taught: 'taught it',
    proved: 'proved it',
    above: 'cleared from above — not shown yet',
    learned: 'learned it',
    open: 'ready for you',
    locked: 'not yet'
  };

  function renderLegend() {
    const legend = el('div', 'pl-legend');
    [
      ['s-proved', 'proved'],
      ['s-above', 'cleared beneath'],
      ['s-open', 'ready for you'],
      ['s-locked', 'not yet']
    ].forEach(function (pair) {
      const item = el('span', 'pl-legend-item');
      const swatch = el('i', 'pl-pip ' + pair[0]);
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(pair[1]));
      legend.appendChild(item);
    });
    return legend;
  }

  function el(tag, cls) {
    const e = document.createElement(tag);
    e.className = cls;
    return e;
  }

  return {
    render: render,
    canRender: canRender,
    showPips: showPips,
    startable: startable,
    fillWidths: fillWidths,
    lede: lede,
    rungSentence: rungSentence
  };
}));
