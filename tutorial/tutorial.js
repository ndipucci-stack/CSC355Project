// guided walkthrough — fires from the Tutorial button in the header.
// no deps, just vanilla JS.

(function () {
  'use strict';

  // each step's selector has to actually exist in the DOM (not hidden)
  const STEPS = [
    {
      selector: null,
      title: 'Welcome to the NFA → DFA Visualizer',
      body:
        "This quick tour walks you through the app in about a minute. " +
        "<br><br><strong>Quick refresher.</strong> An <em>NFA</em> " +
        "(Nondeterministic Finite Automaton) can have many possible next " +
        "states — or none — for the same input symbol, and may include " +
        "ε-transitions (moves that consume no input). A <em>DFA</em> " +
        "(Deterministic Finite Automaton) always has exactly one next " +
        "state per symbol. This tool converts the former into the latter.",
    },
    {
      selector: '#panel-definition',
      placement: 'right',
      title: '1. Define the NFA',
      body:
        "Start by telling the app what your NFA looks like: its " +
        "<strong>states</strong>, the input <strong>alphabet</strong>, a " +
        "<strong>start state</strong>, and which states are " +
        "<strong>accepting</strong>. " +
        "<br><br><em>Tip:</em> include <code>ε</code> (or type " +
        "<code>epsilon</code>) in the alphabet if your NFA uses " +
        "ε-transitions.",
    },
    {
      selector: '#panel-transitions',
      placement: 'right',
      title: '2. Fill in the transition table',
      body:
        "Click <strong>Build Table</strong> to generate a grid from your " +
        "states × alphabet. Each cell holds the set of states reachable " +
        "from that row's state on that column's symbol. " +
        "<br><br>In an NFA, a cell may contain <em>zero, one, or many</em> " +
        "states — that's the nondeterminism.",
    },
    {
      selector: '#graph-nfa',
      placement: 'left',
      title: '3. See your NFA',
      body:
        "As you edit states and transitions, this panel renders your NFA " +
        "as a live graph. The <span style=\"color:var(--start)\">gold</span> " +
        "node is the start state; <span style=\"color:var(--accept)\">teal</span> " +
        "nodes are accepting. Drag nodes to rearrange.",
    },
    {
      selector: '#btn-convert',
      placement: 'bottom',
      title: '4. Run the conversion',
      body:
        "Hit <strong>Convert →</strong> to run the <em>subset construction</em> " +
        "algorithm. The idea: each DFA state is a <strong>set of NFA states</strong> " +
        "the machine could simultaneously be in. " +
        "<br><br>Start from the ε-closure of the NFA's start state, then for " +
        "each symbol compute where that set leads — repeat until no new " +
        "sets appear.",
    },
    {
      selector: '#graph-dfa',
      placement: 'left',
      title: '5. Inspect the DFA',
      body:
        "Your deterministic equivalent appears here. Every DFA state " +
        "corresponds to a subset of NFA states (shown inside the node). " +
        "A <span style=\"color:var(--dead)\">dead state</span> may appear " +
        "— that's the empty set <code>∅</code>, a trap state for inputs " +
        "with no valid transition.",
    },
    {
      selector: '#panel-steps',
      placement: 'left',
      title: '6. Follow the step log',
      body:
        "The <strong>Step Log</strong> tab walks through the algorithm one " +
        "iteration at a time — which subset was processed, which symbol was " +
        "applied, and what new subset was discovered. " +
        "<br><br>Switch to <strong>DFA Table</strong> to see the final " +
        "transition function in tabular form.",
    },
    {
      selector: '#panel-simulate',
      placement: 'right',
      title: '7. Simulate a string',
      body:
        "Type an input string and press <strong>Run</strong> to watch " +
        "either machine process it symbol by symbol. Use " +
        "<strong>Prev / Next</strong> to step through the trace. " +
        "<br><br>An input is <em>accepted</em> if processing ends in an " +
        "accepting state.",
    },
    {
      selector: '#btn-load-preset',
      placement: 'bottom',
      title: '8. Try a preset',
      body:
        "Not sure what to type? <strong>Load Preset</strong> gives you a " +
        "handful of classic example NFAs — a great starting point to see " +
        "the conversion in action before building your own.",
    },
    {
      selector: '#btn-tutorial',
      placement: 'bottom',
      title: "You're all set!",
      body:
        "That's the whole app. You can re-open this tour any time from the " +
        "<strong>✦ Tutorial</strong> button up here. " +
        "<br><br>Happy converting!",
    },
  ];

  // engine state
  let idx = 0;          // current step
  let active = false;   // is the tour open?
  let backdropEl = null;
  let spotlightEl = null;
  let popoverEl = null;
  let escListener = null;
  let resizeListener = null;

  function buildDom() {
    backdropEl = document.createElement('div');
    backdropEl.className = 'tut-backdrop';

    spotlightEl = document.createElement('div');
    spotlightEl.className = 'tut-spotlight';

    popoverEl = document.createElement('div');
    popoverEl.className = 'tut-popover';
    popoverEl.innerHTML = `
      <div class="tut-pop-head">
        <span class="tut-pop-counter" data-tut="counter"></span>
        <button class="tut-pop-close" data-tut="skip" aria-label="Close tutorial">×</button>
      </div>
      <h3 class="tut-pop-title" data-tut="title"></h3>
      <div class="tut-pop-body" data-tut="body"></div>
      <div class="tut-pop-dots" data-tut="dots"></div>
      <div class="tut-pop-foot">
        <button class="btn btn-ghost btn-sm" data-tut="prev">← Back</button>
        <button class="btn btn-primary btn-sm" data-tut="next">Next →</button>
      </div>
    `;

    document.body.appendChild(backdropEl);
    document.body.appendChild(spotlightEl);
    document.body.appendChild(popoverEl);

    popoverEl.querySelector('[data-tut="next"]').addEventListener('click', next);
    popoverEl.querySelector('[data-tut="prev"]').addEventListener('click', prev);
    popoverEl.querySelector('[data-tut="skip"]').addEventListener('click', stop);
    backdropEl.addEventListener('click', stop);
  }

  function destroyDom() {
    [backdropEl, spotlightEl, popoverEl].forEach(el => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    backdropEl = spotlightEl = popoverEl = null;
  }

  function renderStep() {
    const step = STEPS[idx];
    const total = STEPS.length;

    popoverEl.querySelector('[data-tut="counter"]').textContent =
      `Step ${idx + 1} of ${total}`;
    popoverEl.querySelector('[data-tut="title"]').textContent = step.title;
    popoverEl.querySelector('[data-tut="body"]').innerHTML = step.body;

    // progress dots
    const dots = popoverEl.querySelector('[data-tut="dots"]');
    dots.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const d = document.createElement('span');
      d.className = 'tut-dot' + (i === idx ? ' is-active' : '') +
                    (i < idx ? ' is-done' : '');
      dots.appendChild(d);
    }

    const prevBtn = popoverEl.querySelector('[data-tut="prev"]');
    const nextBtn = popoverEl.querySelector('[data-tut="next"]');
    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === total - 1 ? 'Finish ✓' : 'Next →';

    positionForStep(step);
  }

  function positionForStep(step) {
    const target = step.selector ? document.querySelector(step.selector) : null;

    if (!target) {
      // welcome step has no target — just center it
      spotlightEl.style.display = 'none';
      popoverEl.classList.add('is-centered');
      popoverEl.style.top = '';
      popoverEl.style.left = '';
      popoverEl.style.transform = '';
      return;
    }

    popoverEl.classList.remove('is-centered');
    spotlightEl.style.display = 'block';

    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

    // wait a frame for the scroll to finish before measuring
    requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect();
      const pad = 8;

      spotlightEl.style.top = (rect.top - pad) + 'px';
      spotlightEl.style.left = (rect.left - pad) + 'px';
      spotlightEl.style.width = (rect.width + pad * 2) + 'px';
      spotlightEl.style.height = (rect.height + pad * 2) + 'px';

      const placement = resolvePlacement(step.placement || 'bottom', rect);
      placePopover(rect, placement);
    });
  }

  // try the preferred side first; if it doesn't fit, fall back to any side that does
  function resolvePlacement(pref, rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popW = 340;
    const popH = 220;
    const gap = 16;

    const room = {
      top:    rect.top - gap,
      bottom: vh - rect.bottom - gap,
      left:   rect.left - gap,
      right:  vw - rect.right - gap,
    };
    const needs = { top: popH, bottom: popH, left: popW, right: popW };

    if (room[pref] >= needs[pref]) return pref;
    for (const p of ['bottom', 'right', 'top', 'left']) {
      if (room[p] >= needs[p]) return p;
    }
    return pref;
  }

  function placePopover(rect, placement) {
    const gap = 16;
    popoverEl.dataset.placement = placement;

    popoverEl.style.top = '';
    popoverEl.style.left = '';
    popoverEl.style.transform = '';

    const popRect = popoverEl.getBoundingClientRect();
    const popW = popRect.width;
    const popH = popRect.height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = 0, left = 0;
    switch (placement) {
      case 'top':
        top = rect.top - popH - gap;
        left = rect.left + rect.width / 2 - popW / 2;
        break;
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - popW / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - popH / 2;
        left = rect.left - popW - gap;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - popH / 2;
        left = rect.right + gap;
        break;
    }

    // keep it on-screen
    top = Math.max(12, Math.min(top, vh - popH - 12));
    left = Math.max(12, Math.min(left, vw - popW - 12));

    popoverEl.style.top = top + 'px';
    popoverEl.style.left = left + 'px';
  }

  function next() {
    if (idx < STEPS.length - 1) { idx++; renderStep(); }
    else { stop(); }
  }

  function prev() {
    if (idx > 0) { idx--; renderStep(); }
  }

  function start() {
    if (active) return;
    active = true;
    idx = 0;
    buildDom();

    escListener = (e) => {
      if (e.key === 'Escape') stop();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    resizeListener = () => renderStep();

    document.addEventListener('keydown', escListener);
    window.addEventListener('resize', resizeListener);
    window.addEventListener('scroll', resizeListener, true);

    requestAnimationFrame(renderStep);
  }

  function stop() {
    if (!active) return;
    active = false;
    document.removeEventListener('keydown', escListener);
    window.removeEventListener('resize', resizeListener);
    window.removeEventListener('scroll', resizeListener, true);
    destroyDom();
  }

  function bind() {
    const btn = document.getElementById('btn-tutorial');
    if (btn) btn.addEventListener('click', start);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.DfaTutorial = { start, stop };
})();
