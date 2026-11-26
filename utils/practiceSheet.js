/**
 * PRACTICE SHEET — the printable page itself.
 *
 * Owner's format (2026-11-26: "2 columns with line. 2 pages tops"), modelled
 * on the Paper Practice sheets under public/courses/<course>/pdfs: a
 * NAME / DATE / PERIOD line, the title, then numbered problems in TWO
 * COLUMNS read across (1 left, 2 right) with a rule down the middle and open
 * work space under each one. No grid paper, no answer blanks, no badges.
 *
 * The sheet is AT MOST TWO PAGES. That cannot be decided on the server —
 * a problem's height is only known once KaTeX has typeset it — so the page
 * lays itself out (`layoutScript`, run in headless Chrome before printing):
 * it measures every row, picks the most work space that still fits two
 * letter pages, and only if the problems do not fit even at the smallest
 * work space does it drop rows from the end (and the same numbers from the
 * answer key). The answer key, when asked for, is its own page after the
 * sheet; it is for the adult and does not count toward the two.
 *
 * Pure: no database, no browser. routes/practicePack.js gathers the data and
 * prints the result.
 */

'use strict';

// Work space under a row, in CSS px (96 per inch). The layout uses the most
// that fits, between these. FLOOR is the least a student can still write in.
const WORK = { max: 190, comfy: 110, floor: 56, step: 6 };
const MAX_PAGES = 2;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cellHTML(p) {
  if (!p) return '<div class="cell empty"></div>';
  const svg = p.svg ? `<div class="p-svg">${p.svg}</div>` : '';
  const options = Array.isArray(p.options) && p.options.length
    ? `<div class="p-options">${p.options.map(o =>
        `<div class="p-option"><span class="p-letter">${o.label}.</span><span>${o.text}</span></div>`
      ).join('')}</div>`
    : '';
  return `<div class="cell">
      <div class="p-head"><span class="p-num">${p.num}.</span><div class="p-prompt">${p.prompt}</div></div>
      ${svg}${options}
    </div>`;
}

/**
 * @param {object} sheet
 * @param {string} sheet.title         small line above the heading
 * @param {string} [sheet.heading]     the big line (defaults to the title)
 * @param {string} [sheet.studentName] printed on the NAME line; blank = a line to write on
 * @param {string} [sheet.date]
 * @param {Array<{label:string, problems:Array}>} sheet.groups  problems: { prompt, svg, options:[{label,text}], answer }
 * @param {boolean} [sheet.showAnswerKey]
 * @param {string|null} [sheet.qrDataURI]
 */
function buildSheetHTML(sheet) {
  const { title = 'Practice', studentName = '', date = '', groups = [], showAnswerKey = false, qrDataURI = null } = sheet;
  const heading = sheet.heading || title;
  const kicker = sheet.heading && sheet.heading !== title ? title : '';

  let num = 1;
  let poolHTML = '';
  let keyHTML = '';
  const labelled = groups.filter(g => g.problems && g.problems.length);
  for (const g of labelled) {
    if (labelled.length > 1 && g.label) {
      poolHTML += `<div class="item sec">${esc(g.label)}</div>`;
    }
    const numbered = g.problems.map(p => ({ ...p, num: num++ }));
    for (let i = 0; i < numbered.length; i += 2) {
      const pair = [numbered[i], numbered[i + 1]];
      poolHTML += `<div class="item row" data-nums="${pair.filter(Boolean).map(p => p.num).join(',')}">${cellHTML(pair[0])}${cellHTML(pair[1])}</div>`;
    }
    for (const p of numbered) {
      keyHTML += `<div class="ak-item" data-num="${p.num}"><span class="ak-num">${p.num}.</span><span class="ak-answer">${p.answer}</span></div>`;
    }
  }

  const qr = qrDataURI ? `<img class="qr" src="${qrDataURI}" alt="">` : '';
  const answerKey = showAnswerKey ? `
  <div class="key-page">
    <div class="kicker">Answer Key</div>
    <h1>${esc(heading)}</h1>
    <div class="ak-meta">${esc([studentName, date].filter(Boolean).join(' · '))}</div>
    <div class="ak-grid">${keyHTML}</div>
    <div class="ak-note">Answers shown are the primary accepted values. Equivalent forms are accepted when the work is checked.</div>
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(heading)}${studentName ? ' — ' + esc(studentName) : ''}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js"></script>
  <style>
    @page { size: letter; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 8.5in; }
    body {
      font-family: Calibri, Carlito, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 14.5px;
      line-height: 1.4;
      color: #000;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }

    /* One printed page. A fixed box: what does not fit is never printed onto a third. */
    .sheet {
      width: 8.5in; height: 11in;
      padding: 0.55in 0.65in 0.45in;
      display: flex; flex-direction: column;
      overflow: hidden;
      page-break-after: always; break-after: page;
    }
    .sheet:last-of-type { page-break-after: auto; break-after: auto; }
    body.has-key .sheet:last-of-type { page-break-after: always; break-after: page; }

    .nameline { display: flex; gap: 14px; font-size: 11px; letter-spacing: 0.4px; margin-bottom: 20px; }
    .nameline .f { display: flex; align-items: flex-end; gap: 6px; }
    .nameline .f i { flex: 1; border-bottom: 1px solid #000; min-height: 15px; font-style: normal; font-size: 13px; letter-spacing: 0; padding: 0 4px; white-space: nowrap; overflow: hidden; }
    .nameline .name { flex: 5; } .nameline .date { flex: 3; } .nameline .period { flex: 1.6; }

    .kicker { font-size: 16px; font-weight: 700; }
    h1 { font-size: 22px; font-weight: 700; line-height: 1.2; }
    .titles { margin-bottom: 16px; }
    .cont { font-size: 11px; margin-bottom: 12px; }

    /* The two columns and the line between them. */
    .cols { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .cols::before { content: ''; position: absolute; top: 0; bottom: 0; left: 50%; border-left: 1px solid #000; }
    .row { display: grid; grid-template-columns: 1fr 1fr; column-gap: 0.44in; align-content: start; }
    .cell { min-width: 0; padding-top: 2px; }
    .sec {
      position: relative; z-index: 1; background: #fff;
      font-weight: 700; font-size: 14px; padding: 4px 0 8px;
    }
    .cols > .sec:not(:first-child) { border-top: 1px solid #000; padding-top: 8px; }

    .p-head { display: flex; gap: 7px; align-items: baseline; }
    .p-num { font-weight: 700; flex: none; min-width: 20px; }
    .p-prompt { min-width: 0; overflow-wrap: anywhere; }
    .p-prompt .katex-display { margin: 4px 0; text-align: left; }
    .p-prompt .katex-display > .katex { text-align: left; }
    .katex { font-size: 1.1em; }
    .p-svg { margin: 6px 0 2px 27px; }
    .p-svg svg, .p-svg img { max-width: 100%; max-height: 130px; width: auto; height: auto; }
    .p-options { margin: 6px 0 0 27px; display: grid; grid-template-columns: 1fr 1fr; gap: 3px 12px; }
    .p-option { display: flex; gap: 5px; align-items: baseline; min-width: 0; overflow-wrap: anywhere; }
    .p-letter { font-weight: 700; flex: none; }

    .foot { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; font-size: 10.5px; padding-top: 8px; }
    .foot .up { display: flex; align-items: center; gap: 7px; text-align: right; }
    .qr { width: 40px; height: 40px; }

    /* Before the layout runs (or if it cannot): still two columns, in flow. */
    #pool .row { margin-bottom: ${WORK.comfy}px; break-inside: avoid; }
    #pool { padding: 0.55in 0.65in; }

    .key-page { padding: 0.6in 0.65in; }
    .ak-meta { font-size: 12px; margin: 2px 0 18px; }
    .ak-grid { column-count: 2; column-gap: 0.44in; column-rule: 1px solid #000; }
    .ak-item { display: flex; gap: 7px; align-items: baseline; padding: 3px 0; break-inside: avoid; }
    .ak-num { font-weight: 700; min-width: 26px; }
    .ak-note { margin-top: 20px; font-size: 11px; font-style: italic; }
  </style>
</head>
<body class="${showAnswerKey ? 'has-key' : ''}">
  <template id="t-head">
    <div class="nameline">
      <div class="f name">NAME <i>${esc(studentName)}</i></div>
      <div class="f date">DATE <i>${esc(date)}</i></div>
      <div class="f period">PERIOD <i></i></div>
    </div>
    <div class="titles">${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ''}<h1>${esc(heading)}</h1></div>
  </template>
  <template id="t-foot">
    <div class="foot">
      <div>${esc(heading)}<span class="pg"></span></div>
      <div class="up"><span>Done? Snap a photo of your work at <b>mathmatix.ai</b><br>and your tutor will check every step.</span>${qr}</div>
    </div>
  </template>

  <div id="pool">${poolHTML}</div>
  ${answerKey}

  <script>
  (${layoutScript.toString()})(${JSON.stringify({ WORK, MAX_PAGES })});
  </script>
</body>
</html>`;
}

/**
 * Runs IN THE PAGE (stringified above — it must not close over anything).
 * Typesets the math, then moves the rows out of #pool into one or two fixed
 * letter pages. Sets window.__sheet = { pages, dropped } when done.
 */
/* eslint-disable no-undef */
function layoutScript(cfg) {
  var WORK = cfg.WORK, MAX_PAGES = cfg.MAX_PAGES;

  function typeset() {
    try {
      if (window.renderMathInElement) {
        renderMathInElement(document.body, {
          throwOnError: false,
          delimiters: [
            { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }
          ]
        });
      }
    } catch (e) { /* print the source rather than nothing */ }
  }

  function newSheet(first) {
    var s = document.createElement('div');
    s.className = 'sheet';
    if (first) s.appendChild(document.getElementById('t-head').content.cloneNode(true));
    var cols = document.createElement('div');
    cols.className = 'cols';
    s.appendChild(cols);
    s.appendChild(document.getElementById('t-foot').content.cloneNode(true));
    document.body.insertBefore(s, document.getElementById('pool'));
    return s;
  }

  // Greedy fill at a given work space. Returns the pages (lists of items),
  // or null when it takes more pages than `room` has.
  function pack(items, room, work) {
    var pages = [[]], used = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var need = it.h + (it.sec ? 0 : work);
      // A section heading never ends a page on its own.
      var withNext = it.sec && items[i + 1] ? need + items[i + 1].h + work : need;
      var p = pages.length - 1;
      if (used + withNext > room[p] && pages[p].length) {
        if (pages.length === room.length) return null;
        pages.push([]); used = 0;
      }
      pages[pages.length - 1].push(it);
      used += need;
      if (used > room[pages.length - 1]) return null;   // one item taller than a page
    }
    return pages;
  }

  function layout() {
    var pool = document.getElementById('pool');
    // Measure where the rows will live: inside a real first page.
    var first = newSheet(true), second = newSheet(false);
    var room = [first.querySelector('.cols').clientHeight];
    while (room.length < MAX_PAGES) room.push(second.querySelector('.cols').clientHeight);
    var probe = first.querySelector('.cols');
    var g = 0;
    var items = [].slice.call(pool.children).map(function (el) {
      probe.appendChild(el);
      var sec = el.classList.contains('sec');
      if (sec) g++;
      return { el: el, sec: sec, g: g, h: Math.ceil(el.getBoundingClientRect().height) };
    });
    items.forEach(function (it) { it.el.remove(); });
    second.remove();

    var pages = null, work = WORK.max, dropped = [];
    while (items.length) {
      // One page if it fits with comfortable room; otherwise the most room two pages allow.
      var one = pack(items, [room[0]], WORK.comfy);
      if (one) {
        for (work = WORK.max; work > WORK.comfy && !pack(items, [room[0]], work); work -= WORK.step);
        pages = pack(items, [room[0]], work) || one;
        if (pages === one) work = WORK.comfy;
        break;
      }
      for (work = WORK.max; work >= WORK.floor; work -= WORK.step) {
        pages = pack(items, room, work);
        if (pages) break;
      }
      if (pages) break;
      // Does not fit even at the least work space: a row goes — the last row
      // of the section taking the most paper (one that has a row to spare,
      // while there is one), so no skill is cut entirely.
      var count = {}, tall = {}, most = -1;
      items.forEach(function (it) {
        if (it.sec) return;
        count[it.g] = (count[it.g] || 0) + 1;
        tall[it.g] = (tall[it.g] || 0) + it.h;
      });
      var spare = Object.keys(count).some(function (g) { return count[g] > 1; });
      Object.keys(count).forEach(function (g) {
        if (spare && count[g] < 2) return;
        if (most < 0 || tall[g] >= tall[most]) most = +g;
      });
      for (var k = items.length - 1; k >= 0; k--) {
        if (!items[k].sec && items[k].g === most) {
          dropped = dropped.concat((items[k].el.getAttribute('data-nums') || '').split(',').filter(Boolean));
          items.splice(k, 1);
          break;
        }
      }
      items = items.filter(function (it) { return !it.sec || count[it.g] > (it.g === most ? 1 : 0); });
      pages = null;
    }
    pages = pages || [[]];

    pages.forEach(function (list, n) {
      var sheet = n === 0 ? first : newSheet(false);
      var cols = sheet.querySelector('.cols');
      list.forEach(function (it) {
        if (!it.sec) {
          // Each row is given its share of the page; spare room is shared out, up to a cap.
          it.el.style.minHeight = (it.h + work) + 'px';
          it.el.style.maxHeight = (it.h + WORK.max + 40) + 'px';
          it.el.style.flex = '1 1 auto';
        } else {
          it.el.style.flex = 'none';
        }
        cols.appendChild(it.el);
      });
      var pg = sheet.querySelector('.pg');
      if (pg && pages.length > 1) pg.textContent = ' · Page ' + (n + 1) + ' of ' + pages.length;
    });
    pool.remove();

    dropped.forEach(function (num) {
      var k = document.querySelector('.ak-item[data-num="' + num + '"]');
      if (k) k.remove();
    });
    // What is left is numbered 1..n again, on the sheet and in the key alike.
    if (dropped.length) {
      [].forEach.call(document.querySelectorAll('.sheet .p-num'), function (el, i) { el.textContent = (i + 1) + '.'; });
      [].forEach.call(document.querySelectorAll('.ak-item .ak-num'), function (el, i) { el.textContent = (i + 1) + '.'; });
    }
    window.__sheet = { pages: pages.length, dropped: dropped.length, work: work };
  }

  function go() {
    typeset();
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fonts.then(layout, layout).catch(function (e) { window.__sheet = { error: String(e) }; });
  }

  // The KaTeX scripts are deferred, so they have run (or failed) by 'load'.
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go);
}
/* eslint-enable no-undef */

module.exports = { buildSheetHTML, WORK, MAX_PAGES };
