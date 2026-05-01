// main.js — UI glue
// depends on these globals (loaded via script tags before this file):
//   d3, NFA, DFA, Minimizer, Converter, PRESETS

// 1) DOM refs
const $ = id => document.getElementById(id);

const UI = {
  // form inputs
  inputStates:      $('input-states'),
  inputAlpha:       $('input-alphabet'),
  inputStart:       $('input-start'),
  inputAccept:      $('input-accept'),
  inputString:      $('input-string'),

  // header + sim buttons
  btnConvert:       $('btn-convert'),
  btnBuildTable:    $('btn-build-table'),
  btnClear:         $('btn-clear'),
  btnLoadPreset:    $('btn-load-preset'),
  btnSimulate:      $('btn-simulate'),
  btnSimPrev:       $('btn-sim-prev'),
  btnSimNext:       $('btn-sim-next'),
  btnMinimize:      $('btn-minimize'),

  // transition table
  transitionWrap:   $('transition-table-wrap'),

  // graph canvases
  canvasNFA:        $('canvas-nfa'),
  canvasDFA:        $('canvas-dfa'),
  emptyNFA:         $('empty-nfa'),
  emptyDFA:         $('empty-dfa'),

  // steps panel
  stepsList:        $('steps-list'),
  stepsEmpty:       $('steps-empty'),
  dfaTableWrap:     $('dfa-table-wrap'),

  // simulator UI
  simControls:      $('sim-controls'),
  simResult:        $('sim-result'),
  simTape:          $('sim-tape'),
  simStepCounter:   $('sim-step-counter'),

  // preset dropdown
  presetDropdown:   $('preset-dropdown'),
  presetList:       $('preset-list'),

  // toast
  toast:            $('toast'),
  toastMsg:         $('toast-msg'),
};


// 2) app state
let currentNFA  = null;   // NFA we just built
let currentDFA  = null;   // DFA after conversion
let currentMinDFA = null;   // minimized DFA (lazy — null until user clicks)
let currentMinSteps = null; // Moore step log
let isShowingMinimized = false; // which one's in the DFA panel right now

const simState = {
  trace:       [],
  currentStep: 0,
  active:      false
};

// keep handles to the d3 force sims so we can stop them on re-render
let nfaSimulation = null;
let dfaSimulation = null;


// 3) transition table

// tracks the currently open cell-picker popup so we can close it cleanly
const _picker = {
  cell:    null,   // the .tc-cell div that opened it
  popup:   null,   // the .tc-popup element
  states:  []      // valid state list right now
};

// build the click-to-pick transition table.
// each cell is a div; clicking opens a popup of state chips.
// rebuilding keeps any selections you've already made.
function buildTransitionTable() {
  const states   = parseList(UI.inputStates.value);
  const alphabet = parseList(UI.inputAlpha.value).filter(s => s !== 'ε');

  if (states.length === 0 || alphabet.length === 0) {
    showToast('Enter states and alphabet first.', 'error');
    return;
  }

  // close any open popup first
  _closePicker();

  // remember what's already selected so the rebuild doesn't wipe it
  const saved = readTransitionTable();

  const allSymbols = [...alphabet, 'ε'];

  let html = '<table class="transition-table"><thead><tr>';
  html += '<th>State</th>';
  for (const sym of allSymbols) {
    html += `<th>${sym}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const state of states) {
    html += `<tr><td class="state-col">${state}</td>`;
    for (const sym of allSymbols) {
      // pull the saved value back in if we had one
      const savedVal = saved?.[state]?.[sym]
        ? (Array.isArray(saved[state][sym])
            ? saved[state][sym].join(', ')
            : saved[state][sym])
        : '';

      html += `<td>
        <div class="tc-cell"
          data-state="${state}"
          data-symbol="${sym}"
          data-value="${savedVal}"
          tabindex="0"
          role="button"
          aria-label="δ(${state}, ${sym})"
        >${_renderCellContent(savedVal)}</div>
      </td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  UI.transitionWrap.innerHTML = html;

  // hook click + keyboard listeners on every cell
  UI.transitionWrap.querySelectorAll('.tc-cell').forEach(cell => {
    cell.addEventListener('click', e => {
      e.stopPropagation();
      _openPicker(cell, states);
    });
    // also let Enter/Space open the picker for accessibility
    cell.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _openPicker(cell, states);
      }
    });
  });
}

// turn a comma-separated string into chip HTML, or a dash if empty
function _renderCellContent(valueStr) {
  if (!valueStr || valueStr.trim() === '') {
    return '<span class="tc-placeholder">—</span>';
  }
  const parts = valueStr.split(',').map(s => s.trim()).filter(Boolean);
  return parts.map(s => `<span class="tc-chip">${s}</span>`).join('');
}

// pop up a chip picker right below the clicked cell.
// every defined state shows up as a toggleable button.
function _openPicker(cell, states) {
  // kill any existing popup first
  _closePicker();

  const currentVal = cell.dataset.value || '';
  const selected   = new Set(
    currentVal.split(',').map(s => s.trim()).filter(Boolean)
  );

  // build the popup
  const popup = document.createElement('div');
  popup.className = 'tc-popup';

  // header — δ(state, symbol) label + clear button
  const header = document.createElement('div');
  header.className = 'tc-popup-header';
  header.innerHTML =
    `<span class="tc-popup-label">δ(${cell.dataset.state}, ${cell.dataset.symbol})</span>` +
    `<button class="tc-popup-clear" title="Clear selection">Clear</button>`;
  popup.appendChild(header);

  // one chip button per state
  const grid = document.createElement('div');
  grid.className = 'tc-popup-grid';

  states.forEach(state => {
    const btn = document.createElement('button');
    btn.className = 'tc-option' + (selected.has(state) ? ' selected' : '');
    btn.textContent = state;
    btn.dataset.state = state;

    btn.addEventListener('click', e => {
      e.stopPropagation();
      btn.classList.toggle('selected');
      _commitPicker(cell, popup);
    });

    grid.appendChild(btn);
  });

  popup.appendChild(grid);

  // clear button = unselect everything
  header.querySelector('.tc-popup-clear').addEventListener('click', e => {
    e.stopPropagation();
    popup.querySelectorAll('.tc-option').forEach(b => b.classList.remove('selected'));
    _commitPicker(cell, popup);
  });

  // drop it on the page and position it under the cell
  document.body.appendChild(popup);
  _positionPopup(popup, cell);

  // remember refs so we can close it later
  _picker.cell  = cell;
  _picker.popup = popup;
  _picker.states = states;

  cell.classList.add('tc-cell-open');
}

// drop the popup right under the cell, but keep it on screen
function _positionPopup(popup, anchor) {
  const rect = anchor.getBoundingClientRect();
  const scrollY = window.scrollY || 0;
  const scrollX = window.scrollX || 0;

  let top  = rect.bottom + scrollY + 4;
  let left = rect.left   + scrollX;

  // don't let it run off the right edge
  const popupW = 220;
  if (left + popupW > window.innerWidth - 8) {
    left = window.innerWidth - popupW - 8;
  }

  popup.style.top  = `${top}px`;
  popup.style.left = `${left}px`;
}

// read whatever's selected, push it back into the cell.
// doesn't close the popup — chips toggle live.
function _commitPicker(cell, popup) {
  const selected = [...popup.querySelectorAll('.tc-option.selected')]
    .map(b => b.dataset.state);

  const valueStr = selected.join(', ');
  cell.dataset.value   = valueStr;
  cell.innerHTML       = _renderCellContent(valueStr);
  // innerHTML wiped the open class — put it back
  cell.classList.add('tc-cell-open');
}

// shut the popup and tidy up
function _closePicker() {
  if (_picker.popup) {
    _picker.popup.remove();
    _picker.popup = null;
  }
  if (_picker.cell) {
    _picker.cell.classList.remove('tc-cell-open');
    _picker.cell = null;
  }
}

// scrape every cell's data-value back into a nested object that
// Converter.convert() can chew on.
// shape: { state: { symbol: 'q1, q2' } }
function readTransitionTable() {
  const result = {};
  const cells  = UI.transitionWrap.querySelectorAll('.tc-cell');

  for (const cell of cells) {
    const state  = cell.dataset.state;
    const symbol = cell.dataset.symbol;
    const value  = cell.dataset.value?.trim() ?? '';

    if (!result[state]) result[state] = {};
    if (value) result[state][symbol] = value;
  }

  return result;
}


// 4) convert button handler

function handleConvert() {
  const transitions = readTransitionTable();

  const input = {
    states:       UI.inputStates.value,
    alphabet:     UI.inputAlpha.value,
    transitions,
    startState:   UI.inputStart.value,
    acceptStates: UI.inputAccept.value,
    minimize:     false   // user runs minimization separately via the button
  };

  const result = Converter.convert(input);

  if (!result.ok) {
    showToast(result.errors[0], 'error');
    return;
  }

  // stash everything so the sim + step log can reach it
  currentNFA    = result.nfa;
  currentDFA    = result.dfa;
  currentMinDFA = result.minDFA;

  // reset sim + minimizer state on every fresh convert
  resetSimulator();
  currentMinSteps    = null;
  isShowingMinimized = false;
  _updateMinimizeButton();

  // draw both graphs
  renderNFA(currentNFA);
  renderDFA(currentDFA);

  // fill in step log and DFA table
  buildStepLog(result.steps);
  buildDFATable(currentDFA);

  showToast(
    `Converted — ${currentDFA.states.length} DFA states from ${currentNFA.states.length} NFA states.`,
    'success'
  );
}


// 4b) minimize button handler

// toggles the DFA panel between original and Moore-minimized.
// computes the minimized version on first click and caches it.
function handleMinimize() {
  if (!currentDFA) {
    showToast('Convert an NFA first.', 'error');
    return;
  }

  if (!isShowingMinimized) {
    // run it once, cache the result
    if (!currentMinDFA) {
      const result = Minimizer.minimize(currentDFA);
      currentMinDFA   = result.dfa;
      currentMinSteps = result.steps;
    }

    // flip the panel over to the minimized version
    resetSimulator();
    renderDFA(currentMinDFA);
    buildDFATable(currentMinDFA);
    appendMinimizeStepsToLog(currentMinSteps);

    isShowingMinimized = true;

    const delta = currentDFA.states.length - currentMinDFA.states.length;
    showToast(
      delta > 0
        ? `Minimized — ${currentDFA.states.length} → ${currentMinDFA.states.length} states (${delta} merged).`
        : `Already minimal — ${currentDFA.states.length} states.`,
      'success'
    );
  } else {
    // flip back to the original
    resetSimulator();
    renderDFA(currentDFA);
    buildDFATable(currentDFA);

    isShowingMinimized = false;
  }

  _updateMinimizeButton();
}

// keeps the Minimize button's label + disabled state in sync
function _updateMinimizeButton() {
  if (!UI.btnMinimize) return;
  UI.btnMinimize.disabled = !currentDFA;
  UI.btnMinimize.textContent = isShowingMinimized ? 'Show Original' : 'Minimize';
}

// dump the Moore step log into the existing step log panel.
// no-op if there's nothing to log.
function appendMinimizeStepsToLog(steps) {
  if (!steps || steps.length === 0) return;

  // wipe any previous minimize block so toggling doesn't double up
  UI.stepsList.querySelectorAll('.min-step').forEach(el => el.remove());
  const oldHeader = UI.stepsList.querySelector('.min-header');
  if (oldHeader) oldHeader.remove();

  const header = document.createElement('li');
  header.className = 'min-header';
  header.innerHTML = '<span class="step-phase min-phase">MOORE</span> minimization';
  UI.stepsList.appendChild(header);

  steps.forEach(step => {
    const li = document.createElement('li');
    li.className = 'step-item min-step';
    li.innerHTML =
      `<span class="step-phase min-phase">${String(step.phase || '').toUpperCase()}</span> ` +
      (step.description || '');
    UI.stepsList.appendChild(li);
  });
}


// 5) D3 renderer

// shared graph drawer used by both NFA and DFA panels.
// nodeClass / edgeClass let us style them differently.
function drawGraph(container, nodes, edges, nodeClass, edgeClass) {
  // wipe whatever was there
  d3.select(container).selectAll('svg').remove();

  const W = container.clientWidth  || 600;
  const H = container.clientHeight || 300;
  const R = 26;   // node radius

  // make the SVG
  const svg = d3.select(container)
    .append('svg')
    .attr('width', W)
    .attr('height', H);

  // arrowhead marker
  const defs = svg.append('defs');

  defs.append('marker')
    .attr('id', `arrow-${edgeClass}`)
    .attr('viewBox', '0 0 10 10')
    .attr('refX', R + 10)
    .attr('refY', 5)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto-start-reverse')
    .append('path')
      .attr('d', 'M2 1L8 5L2 9')
      .attr('fill', 'none')
      .attr('stroke', nodeClass === 'nfa-node' ? '#7b68ee' : '#3ecfaa')
      .attr('stroke-width', 1.5)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round');

  // force sim setup — d3 wants source/target linked by id
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  const links = edges.map(e => ({
    source: e.from,
    target: e.to,
    label:  e.label,
    self:   e.from === e.to   // self-loop flag
  }));

  const simulation = d3.forceSimulation(nodes)
    .force('link',   d3.forceLink(links).id(d => d.id).distance(110).strength(0.6))
    .force('charge', d3.forceManyBody().strength(-320))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collide', d3.forceCollide(R + 18));

  // edges
  const edgeGroup = svg.append('g').attr('class', 'edges');

  const edgePaths = edgeGroup.selectAll('path')
    .data(links)
    .enter()
    .append('path')
      .attr('class', `edge-path ${edgeClass}`)
      .attr('id', (d, i) => `edge-${edgeClass}-${i}`)
      .attr('fill', 'none')
      .attr('marker-end', `url(#arrow-${edgeClass})`);

  // edge labels — ride the path so they curve with it
  const edgeLabels = edgeGroup.selectAll('text')
    .data(links)
    .enter()
    .append('text')
      .attr('class', 'edge-label')
      .append('textPath')
        .attr('href', (d, i) => `#edge-${edgeClass}-${i}`)
        .attr('startOffset', '50%')
        .attr('text-anchor', 'middle')
        .text(d => d.label);

  // nodes
  const nodeGroup = svg.append('g').attr('class', 'nodes');

  const nodeGs = nodeGroup.selectAll('g')
    .data(nodes)
    .enter()
    .append('g')
      .attr('class', 'node-group')
      .attr('data-id', d => d.id)
      .call(
        d3.drag()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x; d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      );

  // outer circle
  nodeGs.append('circle')
    .attr('class', d => [
      'node-circle',
      nodeClass,
      d.type === 'accept' || d.type === 'start-accept' ? 'accept-node' : '',
      d.type === 'dead' ? 'dead-node' : ''
    ].filter(Boolean).join(' '))
    .attr('r', R);

  // inner ring on accept states (the classic double-circle look)
  nodeGs.filter(d => d.type === 'accept' || d.type === 'start-accept')
    .append('circle')
      .attr('class', 'node-circle-inner')
      .attr('r', R - 5)
      .attr('stroke', nodeClass === 'nfa-node' ? '#7b68ee' : '#3ecfaa')
      .attr('fill', 'none');

  // little arrow pointing into the start state
  nodeGs.filter(d => d.type === 'start' || d.type === 'start-accept')
    .append('path')
      .attr('class', 'start-arrow')
      .attr('d', `M${-R - 22} 0 L${-R - 2} 0`)
      .attr('stroke', '#f5c842')
      .attr('stroke-width', 2)
      .attr('marker-end', `url(#arrow-${edgeClass})`);

  // state name in the middle
  nodeGs.append('text')
    .attr('class', 'node-label')
    .text(d => _truncateLabel(d.id));

  // hover tooltip with the full name (helps with long DFA names)
  nodeGs.append('title').text(d => d.id);

  // every tick: update positions
  simulation.on('tick', () => {
    // clamp nodes to the SVG bounds so they don't drift off-screen
    nodes.forEach(d => {
      d.x = Math.max(R + 10, Math.min(W - R - 10, d.x));
      d.y = Math.max(R + 10, Math.min(H - R - 10, d.y));
    });

    // straight or curved edge, plus a special path for self-loops
    edgePaths.attr('d', d => {
      if (d.self) return _selfLoopPath(d.source.x, d.source.y, R);
      return _edgePath(d.source, d.target, R, links);
    });

    nodeGs.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  // hide the "build your NFA" empty state now that we have a graph
  const emptyEl = container.querySelector('.canvas-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  return simulation;
}

// draw the NFA panel
function renderNFA(nfa) {
  const nodes = nfa.states.map(s => ({
    id:   s,
    type: _nfaStateType(nfa, s)
  }));

  const edges = Converter.nfaEdges(nfa);

  if (nfaSimulation) nfaSimulation.stop();
  nfaSimulation = drawGraph(UI.canvasNFA, nodes, edges, 'nfa-node', 'nfa-edge');
}

// draw the DFA panel
function renderDFA(dfa) {
  const nodes = dfa.states.map(s => ({
    id:   s,
    type: dfa.stateType(s)
  }));

  const edges = Converter.dfaEdges(dfa);

  if (dfaSimulation) dfaSimulation.stop();
  dfaSimulation = drawGraph(UI.canvasDFA, nodes, edges, 'dfa-node', 'dfa-edge');
}

// highlight one node on the DFA graph (used by the simulator).
// clears any previous highlight first.
function highlightDFANode(stateId) {
  d3.select(UI.canvasDFA)
    .selectAll('.node-circle')
    .classed('sim-active', false);

  if (!stateId) return;

  d3.select(UI.canvasDFA)
    .selectAll('.node-group')
    .filter(d => d.id === stateId)
    .select('.node-circle')
    .classed('sim-active', true);
}

// highlight one edge on the DFA graph (used by the simulator)
function highlightDFAEdge(fromId, toId) {
  d3.select(UI.canvasDFA)
    .selectAll('.edge-path')
    .classed('sim-active', false);

  if (!fromId || !toId) return;

  d3.select(UI.canvasDFA)
    .selectAll('.edge-path')
    .filter(d => d.source.id === fromId && d.target.id === toId)
    .classed('sim-active', true);
}


// 6) step log + DFA table

// fill the step log panel with subset-construction steps
function buildStepLog(steps) {
  UI.stepsEmpty.hidden = true;
  UI.stepsList.hidden  = false;
  UI.stepsList.innerHTML = '';

  steps.forEach((step, i) => {
    const li = document.createElement('li');
    li.className = 'step-item';
    li.dataset.index = i;

    // pick a colored badge based on the phase
    let html = '';
    if (step.phase === 'start') {
      html = `<span class="step-phase start-phase">START</span> ` +
             `<span class="step-nfa-set">${step.description}</span>`;
    } else if (step.phase === 'transition') {
      html = `<span class="step-phase trans-phase">δ</span> ` +
             `<span class="step-dfa-state">${step.dfaState}</span>` +
             ` <span class="step-symbol">—${step.symbol}→</span> ` +
             `<span class="step-dfa-state">${step.resultState}</span>`;
    } else if (step.phase === 'accept') {
      html = `<span class="step-phase accept-phase">ACCEPT</span> ` +
             `<span class="step-dfa-state">${step.dfaState}</span> ` +
             `contains <span class="step-nfa-set">${step.nfaSubset.join(',')}</span>`;
    } else {
      html = `<span class="step-phase">${step.phase.toUpperCase()}</span> ` +
             step.description;
    }

    li.innerHTML = html;

    // click a step → highlight the relevant DFA state
    if (step.dfaState && currentDFA) {
      li.addEventListener('click', () => {
        document.querySelectorAll('.step-item').forEach(el => el.classList.remove('active'));
        li.classList.add('active');
        highlightDFANode(step.dfaState);
      });
    }

    UI.stepsList.appendChild(li);
  });
}

// build the DFA transition table in the second tab
function buildDFATable(dfa) {
  let html = '<table class="dfa-table"><thead><tr>';
  html += '<th>State</th>';
  for (const sym of dfa.alphabet) {
    html += `<th>${sym}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const state of dfa.states) {
    const isAccept = dfa.isAccept(state);
    const isDead   = dfa.isDead(state);
    const isStart  = dfa.isStart(state);

    let rowClass = '';
    if (isAccept) rowClass = 'accept-row';
    if (isDead)   rowClass = 'dead-row';

    const marker = (isStart ? '→ ' : '') + (isAccept ? '* ' : '');

    html += `<tr class="${rowClass}">`;
    html += `<td class="dfa-state-cell">${marker}${state}</td>`;
    for (const sym of dfa.alphabet) {
      const target = dfa.transitions[state]?.[sym] ?? '—';
      html += `<td>${target}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  UI.dfaTableWrap.innerHTML = html;
}


// 7) string simulator

function handleSimulate() {
  if (!currentDFA) {
    showToast('Convert an NFA first.', 'error');
    return;
  }

  const input = UI.inputString.value;
  const { accepted, trace } = currentDFA.simulate(input);

  simState.trace       = trace;
  simState.currentStep = 0;
  simState.active      = true;

  // un-hide all the sim UI
  UI.simControls.hidden = false;
  UI.simTape.hidden     = false;
  UI.simResult.hidden   = false;

  // build the tape cells
  _renderTapeCells(input);

  // accept/reject banner
  UI.simResult.className = `sim-result ${accepted ? 'accept' : 'reject'}`;
  UI.simResult.textContent = accepted ? '✓ ACCEPTED' : '✗ REJECTED';

  // start at step 0
  _applySimStep(0);
}

// build the tape cells from the input string
function _renderTapeCells(inputString) {
  UI.simTape.innerHTML = '';
  const chars = inputString === '' ? ['ε'] : [...inputString];

  chars.forEach((ch, i) => {
    const cell = document.createElement('div');
    cell.className = 'tape-cell';
    cell.dataset.index = i;
    cell.textContent = ch;
    UI.simTape.appendChild(cell);
  });
}

// paint the UI for a given step index in the trace
function _applySimStep(stepIndex) {
  const trace = simState.trace;
  if (!trace.length) return;

  const step = trace[stepIndex];

  // step counter
  UI.simStepCounter.textContent =
    `Step ${Math.max(0, stepIndex)} / ${trace.length - 1}`;

  // highlight whichever node we're on
  highlightDFANode(step.toState ?? step.fromState);

  // highlight the edge we just crossed (if any)
  if (step.fromState && step.toState) {
    highlightDFAEdge(step.fromState, step.toState);
  } else {
    highlightDFAEdge(null, null);
  }

  // update tape cell styles: active vs already consumed
  const cells = UI.simTape.querySelectorAll('.tape-cell');
  cells.forEach((cell, i) => {
    cell.classList.remove('active', 'consumed');
    if (i === step.stepIndex)     cell.classList.add('active');
    else if (i < step.stepIndex)  cell.classList.add('consumed');
  });
}

function handleSimPrev() {
  if (!simState.active || simState.currentStep <= 0) return;
  simState.currentStep--;
  _applySimStep(simState.currentStep);
}

function handleSimNext() {
  if (!simState.active || simState.currentStep >= simState.trace.length - 1) return;
  simState.currentStep++;
  _applySimStep(simState.currentStep);
}

function resetSimulator() {
  simState.trace       = [];
  simState.currentStep = 0;
  simState.active      = false;

  UI.simControls.hidden = true;
  UI.simTape.hidden     = true;
  UI.simResult.hidden   = true;
  UI.simTape.innerHTML  = '';

  highlightDFANode(null);
  highlightDFAEdge(null, null);
}


// 8) presets

// fill the dropdown from the PRESETS array in examples/presets.js
function initPresets() {
  if (!Array.isArray(PRESETS) || PRESETS.length === 0) return;

  UI.presetList.innerHTML = '';
  PRESETS.forEach(preset => {
    const li  = document.createElement('li');
    const btn = document.createElement('button');

    // each button shows the name + a one-line description
    btn.innerHTML =
      `<span class="preset-item-name">${preset.name}</span>` +
      `<span class="preset-item-desc">${preset.desc ?? ''}</span>`;

    btn.addEventListener('click', () => {
      loadPreset(preset);
      UI.presetDropdown.hidden = true;
    });

    li.appendChild(btn);
    UI.presetList.appendChild(li);
  });
}

// load a preset: fill the form, build/fill the table, then auto-convert
function loadPreset(preset) {
  // 1. fill the definition fields
  UI.inputStates.value = preset.states.join(', ');
  UI.inputAlpha.value  = preset.alphabet.join(', ');
  UI.inputStart.value  = preset.startState;
  UI.inputAccept.value = preset.acceptStates.join(', ');

  // 2. build the empty transition table
  buildTransitionTable();

  // 3. drop preset transitions into each cell
  const cells = UI.transitionWrap.querySelectorAll('.tc-cell');
  cells.forEach(cell => {
    const state  = cell.dataset.state;
    const symbol = cell.dataset.symbol;
    const val    = preset.transitions?.[state]?.[symbol];
    const valStr = Array.isArray(val) ? val.join(', ') : (val ?? '');
    cell.dataset.value = valStr;
    cell.innerHTML     = _renderCellContent(valStr);
  });

  // 4. auto-run conversion so the graphs show up right away
  handleConvert();

  showToast(`Loaded: ${preset.name}`, 'success');
}


// 9) tabs

function initTabs() {
  document.querySelectorAll('.steps-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      document.querySelectorAll('.steps-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === target));

      document.querySelectorAll('.steps-tab-content').forEach(panel =>
        panel.classList.toggle('active', panel.id === `tab-${target}`));
    });
  });
}


// 10) utilities

// split "a, b, c" → ["a", "b", "c"], skipping empties
function parseList(str) {
  return (str ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// show a quick toast notification (auto-hides after a few sec)
let _toastTimer = null;
function showToast(msg, type = '') {
  UI.toastMsg.textContent  = msg;
  UI.toast.className       = `toast show ${type}`;
  UI.toast.hidden          = false;

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    UI.toast.classList.remove('show');
    setTimeout(() => { UI.toast.hidden = true; }, 200);
  }, 3000);
}

// nuke everything back to a blank slate
function clearAll() {
  // inputs
  UI.inputStates.value = '';
  UI.inputAlpha.value  = '';
  UI.inputStart.value  = '';
  UI.inputAccept.value = '';
  UI.inputString.value = '';

  // transition table
  UI.transitionWrap.innerHTML =
    '<p class="empty-hint">Enter states and alphabet above, then click <strong>Build Table</strong>.</p>';

  // graphs
  d3.select(UI.canvasNFA).selectAll('svg').remove();
  d3.select(UI.canvasDFA).selectAll('svg').remove();
  UI.emptyNFA.style.display = '';
  UI.emptyDFA.style.display = '';

  // steps panel
  UI.stepsList.hidden     = true;
  UI.stepsEmpty.hidden    = false;
  UI.stepsList.innerHTML  = '';
  UI.dfaTableWrap.innerHTML =
    '<p class="empty-hint">Run conversion to see the transition table.</p>';

  // sim
  resetSimulator();

  // state
  currentNFA       = null;
  currentDFA       = null;
  currentMinDFA    = null;
  currentMinSteps  = null;
  isShowingMinimized = false;
  _updateMinimizeButton();

  if (nfaSimulation) { nfaSimulation.stop(); nfaSimulation = null; }
  if (dfaSimulation) { dfaSimulation.stop(); dfaSimulation = null; }
}


// graph helpers — pure geometry

// build the SVG path for an edge between two nodes.
// curves it if there's also a reverse edge, so they don't overlap.
function _edgePath(source, target, R, allLinks) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist === 0) return '';

  // is there an edge going the other way too?
  const hasReverse = allLinks.some(l =>
    l.source.id === target.id && l.target.id === source.id
  );

  if (!hasReverse) {
    // straight line, trimmed to the node circles
    const nx = dx / dist;
    const ny = dy / dist;
    const x1 = source.x + nx * R;
    const y1 = source.y + ny * R;
    const x2 = target.x - nx * R;
    const y2 = target.y - ny * R;
    return `M${x1},${y1} L${x2},${y2}`;
  }

  // bend it slightly so the two arrows don't sit on top of each other
  const mx = (source.x + target.x) / 2;
  const my = (source.y + target.y) / 2;
  const nx = -dy / dist;   // perpendicular
  const ny =  dx / dist;
  const curve = 30;
  const cx = mx + nx * curve;
  const cy = my + ny * curve;

  // pull the endpoints back onto the node circles
  const angle1 = Math.atan2(cy - source.y, cx - source.x);
  const angle2 = Math.atan2(target.y - cy, target.x - cx);

  const x1 = source.x + Math.cos(angle1) * R;
  const y1 = source.y + Math.sin(angle1) * R;
  const x2 = target.x - Math.cos(angle2) * R;
  const y2 = target.y - Math.sin(angle2) * R;

  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

// SVG path for a self-loop sitting on top of a node at (x, y)
function _selfLoopPath(x, y, R) {
  const offset = R + 6;
  const size   = 28;
  return `M${x - offset * 0.4},${y - offset}
          C${x - size},${y - offset - size}
           ${x + size},${y - offset - size}
           ${x + offset * 0.4},${y - offset}`;
}

// trim long DFA names so they fit inside the circle.
// the full thing still shows up in the tooltip.
function _truncateLabel(label) {
  if (label.length <= 8) return label;
  return label.slice(0, 6) + '…';
}

// figure out an NFA state's "type" for the renderer.
// (NFA class doesn't have its own stateType() like DFA does.)
function _nfaStateType(nfa, state) {
  const isStart  = state === nfa.startState;
  const isAccept = nfa.acceptStates.has(state);
  if (isStart && isAccept) return 'start-accept';
  if (isStart)  return 'start';
  if (isAccept) return 'accept';
  return 'normal';
}


// extra CSS dropped in at runtime — these badges depend on dynamic
// classes so it's easier to keep them here than in style.css
(function injectStepStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .step-phase {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1px;
      padding: 2px 5px;
      border-radius: 3px;
      margin-right: 4px;
      vertical-align: middle;
    }
    .start-phase  { background: rgba(245,200,66,0.15);  color: #f5c842; border: 1px solid rgba(245,200,66,0.3);  }
    .trans-phase  { background: rgba(123,104,238,0.15); color: #7b68ee; border: 1px solid rgba(123,104,238,0.3); }
    .accept-phase { background: rgba(62,207,170,0.15);  color: #3ecfaa; border: 1px solid rgba(62,207,170,0.3);  }
    .min-phase    { background: rgba(240,85,104,0.15);  color: #f05568; border: 1px solid rgba(240,85,104,0.3);  }
    .min-header   { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border2, rgba(255,255,255,0.18)); font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text2, #9aa3b8); list-style: none; }
    .dead-node    { opacity: 0.45; }
    .node-circle.sim-active {
      stroke-width: 3;
      filter: drop-shadow(0 0 8px currentColor);
    }
  `;
  document.head.appendChild(style);
})();


// 11) boot — wire up every event listener once the DOM is ready
document.addEventListener('DOMContentLoaded', () => {

  // main buttons
  UI.btnConvert.addEventListener('click', handleConvert);
  UI.btnBuildTable.addEventListener('click', buildTransitionTable);
  UI.btnClear.addEventListener('click', clearAll);
  if (UI.btnMinimize) UI.btnMinimize.addEventListener('click', handleMinimize);

  // simulator
  UI.btnSimulate.addEventListener('click', handleSimulate);
  UI.btnSimPrev.addEventListener('click', handleSimPrev);
  UI.btnSimNext.addEventListener('click', handleSimNext);

  // hitting Enter in the string box runs the sim
  UI.inputString.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSimulate();
  });

  // preset dropdown open/close
  UI.btnLoadPreset.addEventListener('click', () => {
    UI.presetDropdown.hidden = !UI.presetDropdown.hidden;
  });

  // click anywhere outside the preset wrapper closes the dropdown
  document.addEventListener('click', e => {
    if (!UI.presetDropdown.hidden &&
        !UI.btnLoadPreset.closest('.preset-wrap').contains(e.target)) {
      UI.presetDropdown.hidden = true;
    }
  });

  // re-build the table when states or alphabet change (only if it exists)
  [UI.inputStates, UI.inputAlpha].forEach(input => {
    input.addEventListener('change', () => {
      if (UI.transitionWrap.querySelector('table')) {
        buildTransitionTable();
      }
    });
  });

  // click outside the cell picker closes it
  document.addEventListener('click', e => {
    if (_picker.popup && !_picker.popup.contains(e.target)) {
      _closePicker();
    }
  });

  // scrolling closes the picker too (otherwise it misaligns)
  window.addEventListener('scroll', _closePicker, true);

  // tabs
  initTabs();

  // presets
  initPresets();
});