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
   * Paint the ladder into `host`.
   *
   * @param {HTMLElement} host
   * @param {Object} ladder  payload from POST /api/screener/complete
   * @returns {boolean} false when there was nothing honest to draw, so the
   *                    caller can fall back rather than leave a blank hero.
   */
  function render(host, ladder) {
    if (!host || !canRender(ladder)) return false;

    host.textContent = '';
    host.classList.add('pl');

    const intro = el('p', 'pl-lede');
    intro.textContent = lede(ladder.totals);
    host.appendChild(intro);

    const list = el('ol', 'pl-rungs');
    list.setAttribute('aria-label', 'What you already know, by course band');

    ladder.rungs.slice().reverse().forEach(function (rung) {
      list.appendChild(renderRung(rung));
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

  function renderRung(rung) {
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

    li.setAttribute('aria-label', rungSentence(rung));
    return li;
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
    fillWidths: fillWidths,
    lede: lede,
    rungSentence: rungSentence
  };
}));
