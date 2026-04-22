//  main.js — UI orchestrator
//
//  Depends on (loaded via script tags before this file):
//    d3        (CDN global)
//    NFA       (automata/nfa.js)
//    DFA       (automata/dfa.js)
//    Minimizer (automata/minimizer.js)
//    Converter (automata/converter.js)
//    PRESETS   (examples/presets.js)
// 


// 
//  1. DOM REFERENCES
// 
const $ = id => document.getElementById(id);

const UI = {
  // Inputs
  inputStates:      $('input-states'),
  inputAlpha:       $('input-alphabet'),
  inputStart:       $('input-start'),
  inputAccept:      $('input-accept'),
  inputString:      $('input-string'),

  // Buttons
  btnConvert:       $('btn-convert'),
  btnBuildTable:    $('btn-build-table'),
  btnClear:         $('btn-clear'),
  btnLoadPreset:    $('btn-load-preset'),
  btnSimulate:      $('btn-simulate'),
  btnSimPrev:       $('btn-sim-prev'),
  btnSimNext:       $('btn-sim-next'),

  // Transition table
  transitionWrap:   $('transition-table-wrap'),

  // Graph canvases
  canvasNFA:        $('canvas-nfa'),
  canvasDFA:        $('canvas-dfa'),
  emptyNFA:         $('empty-nfa'),
  emptyDFA:         $('empty-dfa'),

  // Steps panel
  stepsList:        $('steps-list'),
  stepsEmpty:       $('steps-empty'),
  dfaTableWrap:     $('dfa-table-wrap'),

  // Simulator UI
  simControls:      $('sim-controls'),
  simResult:        $('sim-result'),
  simTape:          $('sim-tape'),
  simStepCounter:   $('sim-step-counter'),

  // Preset dropdown
  presetDropdown:   $('preset-dropdown'),
  presetList:       $('preset-list'),

  // Toast
  toast:            $('toast'),
  toastMsg:         $('toast-msg'),
};


// 
//  2. APP STATE
// 
let currentNFA  = null;   // NFA instance
let currentDFA  = null;   // DFA instance (post conversion)
let currentMinDFA = null; // DFA instance (post minimization, or null)

const simState = {
  trace:       [],
  currentStep: 0,
  active:      false
};

// D3 simulation handles — kept so we can stop them on re-render
let nfaSimulation = null;
let dfaSimulation = null;


// 
//  3. TRANSITION TABLE
// 

// ── TRANSITION TABLE — cell picker state ─────────────────
// Tracks the currently open popup so we can close it cleanly.
const _picker = {
  cell:    null,   // the .tc-cell div that opened the picker
  popup:   null,   // the .tc-popup element
  states:  []      // current valid state list
};

/**
 * Build the click-to-select transition table.
 * Each cell is a <div> showing the current selection.
 * Clicking a cell opens a state-chip picker popup.
 * Preserves existing selections when rebuilding.
 */
function buildTransitionTable() {
  const states   = parseList(UI.inputStates.value);
  const alphabet = parseList(UI.inputAlpha.value).filter(s => s !== 'ε');

  if (states.length === 0 || alphabet.length === 0) {
    showToast('Enter states and alphabet first.', 'error');
    return;
  }

  // Close any open picker before rebuilding
  _closePicker();

  // Snapshot existing selections so we can restore after rebuild
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
      // Restore saved value or empty
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

  // Attach click listeners to every cell
  UI.transitionWrap.querySelectorAll('.tc-cell').forEach(cell => {
    cell.addEventListener('click', e => {
      e.stopPropagation();
      _openPicker(cell, states);
    });
    // Keyboard: open picker on Enter/Space
    cell.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _openPicker(cell, states);
      }
    });
  });
}

/**
 * Render the display content of a cell from a comma-separated
 * value string. Shows chips for each selected state, or a
 * muted dash placeholder if empty.
 */
function _renderCellContent(valueStr) {
  if (!valueStr || valueStr.trim() === '') {
    return '<span class="tc-placeholder">—</span>';
  }
  const parts = valueStr.split(',').map(s => s.trim()).filter(Boolean);
  return parts.map(s => `<span class="tc-chip">${s}</span>`).join('');
}

/**
 * Open a state-picker popup anchored below the clicked cell.
 * Shows every defined state as a toggleable chip button.
 *
 * @param {HTMLElement} cell    - the .tc-cell that was clicked
 * @param {string[]}    states  - all valid NFA states
 */
function _openPicker(cell, states) {
  // Close any existing picker first
  _closePicker();

  const currentVal = cell.dataset.value || '';
  const selected   = new Set(
    currentVal.split(',').map(s => s.trim()).filter(Boolean)
  );

  // Build popup element
  const popup = document.createElement('div');
  popup.className = 'tc-popup';

  // Header
  const header = document.createElement('div');
  header.className = 'tc-popup-header';
  header.innerHTML =
    `<span class="tc-popup-label">δ(${cell.dataset.state}, ${cell.dataset.symbol})</span>` +
    `<button class="tc-popup-clear" title="Clear selection">Clear</button>`;
  popup.appendChild(header);

  // State chip buttons
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

  // Clear button wipes all selections
  header.querySelector('.tc-popup-clear').addEventListener('click', e => {
    e.stopPropagation();
    popup.querySelectorAll('.tc-option').forEach(b => b.classList.remove('selected'));
    _commitPicker(cell, popup);
  });

  // Position popup below the cell
  document.body.appendChild(popup);
  _positionPopup(popup, cell);

  // Store refs
  _picker.cell  = cell;
  _picker.popup = popup;
  _picker.states = states;

  cell.classList.add('tc-cell-open');
}

/**
 * Position the popup below the anchor cell, keeping it
 * within the viewport horizontally.
 */
function _positionPopup(popup, anchor) {
  const rect = anchor.getBoundingClientRect();
  const scrollY = window.scrollY || 0;
  const scrollX = window.scrollX || 0;

  let top  = rect.bottom + scrollY + 4;
  let left = rect.left   + scrollX;

  // Prevent overflow off the right edge
  const popupW = 220;
  if (left + popupW > window.innerWidth - 8) {
    left = window.innerWidth - popupW - 8;
  }

  popup.style.top  = `${top}px`;
  popup.style.left = `${left}px`;
}

/**
 * Read selected chips from popup, update cell data-value
 * and re-render cell content. Does NOT close the popup —
 * selections update live as chips are toggled.
 */
function _commitPicker(cell, popup) {
  const selected = [...popup.querySelectorAll('.tc-option.selected')]
    .map(b => b.dataset.state);

  const valueStr = selected.join(', ');
  cell.dataset.value   = valueStr;
  cell.innerHTML       = _renderCellContent(valueStr);
  // Re-attach open indicator since innerHTML was replaced
  cell.classList.add('tc-cell-open');
}

/**
 * Close the active picker popup and clean up.
 */
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

/**
 * Read all cell data-value attributes back into a transitions
 * object for Converter.convert().
 *
 * Shape: { state: { symbol: 'q1, q2' } }
 */
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


// 
//  4. CONVERSION HANDLER
// 

function handleConvert() {
  const transitions = readTransitionTable();

  const input = {
    states:       UI.inputStates.value,
    alphabet:     UI.inputAlpha.value,
    transitions,
    startState:   UI.inputStart.value,
    acceptStates: UI.inputAccept.value,
    minimize:     false   // minimization toggle can be wired later
  };

  const result = Converter.convert(input);

  if (!result.ok) {
    showToast(result.errors[0], 'error');
    return;
  }

  // Store globally so simulator and step log can access them
  currentNFA    = result.nfa;
  currentDFA    = result.dfa;
  currentMinDFA = result.minDFA;

  // Reset simulator
  resetSimulator();

  // Render both graphs
  renderNFA(currentNFA);
  renderDFA(currentDFA);

  // Populate step log and DFA table
  buildStepLog(result.steps);
  buildDFATable(currentDFA);

  showToast(
    `Converted — ${currentDFA.states.length} DFA states from ${currentNFA.states.length} NFA states.`,
    'success'
  );
}


// 
//  5. D3 RENDERER
// 

/**
 * Shared D3 graph drawing function.
 * Both NFA and DFA use this — differences are handled via
 * the colorClass and edgeClass arguments.
 *
 * @param {HTMLElement} container  - the .graph-canvas element
 * @param {Object[]}    nodes      - [{ id, type }]
 * @param {Object[]}    edges      - [{ from, to, label }]
 * @param {string}      nodeClass  - CSS class for nodes ('nfa-node'|'dfa-node')
 * @param {string}      edgeClass  - CSS class for edges ('nfa-edge'|'dfa-edge')
 * @returns D3 simulation instance
 */
function drawGraph(container, nodes, edges, nodeClass, edgeClass) {
  // Clear previous render
  d3.select(container).selectAll('svg').remove();

  const W = container.clientWidth  || 600;
  const H = container.clientHeight || 300;
  const R = 26;   // node radius

  //  SVG setup 
  const svg = d3.select(container)
    .append('svg')
    .attr('width', W)
    .attr('height', H);

  // Arrow marker defs
  const defs = svg.append('defs');

  // Standard arrowhead
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

  //  Force simulation 
  // Build link objects d3 needs (source/target by id)
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

  //  Edge group 
  const edgeGroup = svg.append('g').attr('class', 'edges');

  const edgePaths = edgeGroup.selectAll('path')
    .data(links)
    .enter()
    .append('path')
      .attr('class', `edge-path ${edgeClass}`)
      .attr('id', (d, i) => `edge-${edgeClass}-${i}`)
      .attr('fill', 'none')
      .attr('marker-end', `url(#arrow-${edgeClass})`);

  // Edge labels on paths
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

  //  Node group 
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

  // Outer circle
  nodeGs.append('circle')
    .attr('class', d => [
      'node-circle',
      nodeClass,
      d.type === 'accept' || d.type === 'start-accept' ? 'accept-node' : '',
      d.type === 'dead' ? 'dead-node' : ''
    ].filter(Boolean).join(' '))
    .attr('r', R);

  // Inner ring for accept states
  nodeGs.filter(d => d.type === 'accept' || d.type === 'start-accept')
    .append('circle')
      .attr('class', 'node-circle-inner')
      .attr('r', R - 5)
      .attr('stroke', nodeClass === 'nfa-node' ? '#7b68ee' : '#3ecfaa')
      .attr('fill', 'none');

  // Start arrow indicator
  nodeGs.filter(d => d.type === 'start' || d.type === 'start-accept')
    .append('path')
      .attr('class', 'start-arrow')
      .attr('d', `M${-R - 22} 0 L${-R - 2} 0`)
      .attr('stroke', '#f5c842')
      .attr('stroke-width', 2)
      .attr('marker-end', `url(#arrow-${edgeClass})`);

  // State label
  nodeGs.append('text')
    .attr('class', 'node-label')
    .text(d => _truncateLabel(d.id));

  // Tooltip — show full name on hover (useful for long DFA state names)
  nodeGs.append('title').text(d => d.id);

  //  Tick: update positions 
  simulation.on('tick', () => {
    // Keep nodes inside the SVG bounds
    nodes.forEach(d => {
      d.x = Math.max(R + 10, Math.min(W - R - 10, d.x));
      d.y = Math.max(R + 10, Math.min(H - R - 10, d.y));
    });

    // Position edges — curved for back-edges, self-loops handled separately
    edgePaths.attr('d', d => {
      if (d.self) return _selfLoopPath(d.source.x, d.source.y, R);
      return _edgePath(d.source, d.target, R, links);
    });

    nodeGs.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  // Hide empty state overlay once we render
  const emptyEl = container.querySelector('.canvas-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  return simulation;
}

/**
 * Render the NFA graph.
 */
function renderNFA(nfa) {
  const nodes = nfa.states.map(s => ({
    id:   s,
    type: _nfaStateType(nfa, s)
  }));

  const edges = Converter.nfaEdges(nfa);

  if (nfaSimulation) nfaSimulation.stop();
  nfaSimulation = drawGraph(UI.canvasNFA, nodes, edges, 'nfa-node', 'nfa-edge');
}

/**
 * Render the DFA graph.
 */
function renderDFA(dfa) {
  const nodes = dfa.states.map(s => ({
    id:   s,
    type: dfa.stateType(s)
  }));

  const edges = Converter.dfaEdges(dfa);

  if (dfaSimulation) dfaSimulation.stop();
  dfaSimulation = drawGraph(UI.canvasDFA, nodes, edges, 'dfa-node', 'dfa-edge');
}

/**
 * Highlight a specific node on the DFA graph (used by simulator).
 * Clears previous highlights first.
 */
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

/**
 * Highlight the active edge on the DFA graph (used by simulator).
 */
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


// 
//  6. STEP LOG + DFA TABLE
// 

/**
 * Build the subset construction step log in the right panel.
 */
function buildStepLog(steps) {
  UI.stepsEmpty.hidden = true;
  UI.stepsList.hidden  = false;
  UI.stepsList.innerHTML = '';

  steps.forEach((step, i) => {
    const li = document.createElement('li');
    li.className = 'step-item';
    li.dataset.index = i;

    // Color-coded description based on phase
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

    // Clicking a step highlights the relevant DFA state
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

/**
 * Build the DFA transition table in the second tab.
 */
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


// 
//  7. STRING SIMULATOR
// 

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

  // Show controls and tape
  UI.simControls.hidden = false;
  UI.simTape.hidden     = false;
  UI.simResult.hidden   = false;

  // Build tape cells
  _renderTapeCells(input);

  // Show accept/reject result
  UI.simResult.className = `sim-result ${accepted ? 'accept' : 'reject'}`;
  UI.simResult.textContent = accepted ? '✓ ACCEPTED' : '✗ REJECTED';

  // Render first step
  _applySimStep(0);
}

/**
 * Build the visual tape from the input string.
 */
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

/**
 * Apply visual state for a given trace step index.
 */
function _applySimStep(stepIndex) {
  const trace = simState.trace;
  if (!trace.length) return;

  const step = trace[stepIndex];

  // Update counter
  UI.simStepCounter.textContent =
    `Step ${Math.max(0, stepIndex)} / ${trace.length - 1}`;

  // Highlight active DFA node
  highlightDFANode(step.toState ?? step.fromState);

  // Highlight edge if applicable
  if (step.fromState && step.toState) {
    highlightDFAEdge(step.fromState, step.toState);
  } else {
    highlightDFAEdge(null, null);
  }

  // Update tape cell styles
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


// 
//  8. PRESETS
// 

/**
 * Populate the preset list from the PRESETS array
 * defined in examples/presets.js.
 */
function initPresets() {
  if (!Array.isArray(PRESETS) || PRESETS.length === 0) return;

  UI.presetList.innerHTML = '';
  PRESETS.forEach(preset => {
    const li  = document.createElement('li');
    const btn = document.createElement('button');

    // Two-line button: name + description
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

/**
 * Load a preset: fill all inputs, build and fill the
 * transition table, then auto-run conversion.
 */
function loadPreset(preset) {
  // 1. Fill the definition fields
  UI.inputStates.value = preset.states.join(', ');
  UI.inputAlpha.value  = preset.alphabet.join(', ');
  UI.inputStart.value  = preset.startState;
  UI.inputAccept.value = preset.acceptStates.join(', ');

  // 2. Build the transition table so cells exist
  buildTransitionTable();

  // 3. Fill each cell from the preset transitions
  const cells = UI.transitionWrap.querySelectorAll('.tc-cell');
  cells.forEach(cell => {
    const state  = cell.dataset.state;
    const symbol = cell.dataset.symbol;
    const val    = preset.transitions?.[state]?.[symbol];
    const valStr = Array.isArray(val) ? val.join(', ') : (val ?? '');
    cell.dataset.value = valStr;
    cell.innerHTML     = _renderCellContent(valStr);
  });

  // 4. Auto-convert so graphs appear immediately
  handleConvert();

  showToast(`Loaded: ${preset.name}`, 'success');
}


// 
//  9. TABS
// 

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


// 
//  10. UTILITIES
// 

/**
 * Split a comma-separated string into a trimmed, non-empty array.
 */
function parseList(str) {
  return (str ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Show a toast notification.
 * @param {string} msg
 * @param {'error'|'success'|''} type
 */
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

/**
 * Reset everything to a blank state.
 */
function clearAll() {
  // Inputs
  UI.inputStates.value = '';
  UI.inputAlpha.value  = '';
  UI.inputStart.value  = '';
  UI.inputAccept.value = '';
  UI.inputString.value = '';

  // Transition table
  UI.transitionWrap.innerHTML =
    '<p class="empty-hint">Enter states and alphabet above, then click <strong>Build Table</strong>.</p>';

  // Graphs
  d3.select(UI.canvasNFA).selectAll('svg').remove();
  d3.select(UI.canvasDFA).selectAll('svg').remove();
  UI.emptyNFA.style.display = '';
  UI.emptyDFA.style.display = '';

  // Steps
  UI.stepsList.hidden     = true;
  UI.stepsEmpty.hidden    = false;
  UI.stepsList.innerHTML  = '';
  UI.dfaTableWrap.innerHTML =
    '<p class="empty-hint">Run conversion to see the transition table.</p>';

  // Simulator
  resetSimulator();

  // State
  currentNFA    = null;
  currentDFA    = null;
  currentMinDFA = null;

  if (nfaSimulation) { nfaSimulation.stop(); nfaSimulation = null; }
  if (dfaSimulation) { dfaSimulation.stop(); dfaSimulation = null; }
}


// 
//  GRAPH HELPERS (geometry)
// 

/**
 * Compute SVG path `d` attribute for an edge between two nodes.
 * Curves the path if there is a reverse edge (bidirectional),
 * so the two lines don't overlap.
 */
function _edgePath(source, target, R, allLinks) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist === 0) return '';

  // Check if there is a reverse edge
  const hasReverse = allLinks.some(l =>
    l.source.id === target.id && l.target.id === source.id
  );

  if (!hasReverse) {
    // Straight line
    const nx = dx / dist;
    const ny = dy / dist;
    const x1 = source.x + nx * R;
    const y1 = source.y + ny * R;
    const x2 = target.x - nx * R;
    const y2 = target.y - ny * R;
    return `M${x1},${y1} L${x2},${y2}`;
  }

  // Curved arc to avoid overlap with reverse edge
  const mx = (source.x + target.x) / 2;
  const my = (source.y + target.y) / 2;
  const nx = -dy / dist;   // perpendicular
  const ny =  dx / dist;
  const curve = 30;
  const cx = mx + nx * curve;
  const cy = my + ny * curve;

  // Adjust start and end to sit on the node circles
  const angle1 = Math.atan2(cy - source.y, cx - source.x);
  const angle2 = Math.atan2(target.y - cy, target.x - cx);

  const x1 = source.x + Math.cos(angle1) * R;
  const y1 = source.y + Math.sin(angle1) * R;
  const x2 = target.x - Math.cos(angle2) * R;
  const y2 = target.y - Math.sin(angle2) * R;

  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

/**
 * Compute SVG path for a self-loop at (x, y).
 */
function _selfLoopPath(x, y, R) {
  const offset = R + 6;
  const size   = 28;
  return `M${x - offset * 0.4},${y - offset}
          C${x - size},${y - offset - size}
           ${x + size},${y - offset - size}
           ${x + offset * 0.4},${y - offset}`;
}

/**
 * Truncate long DFA state labels for display inside the node circle.
 * Full label is shown in the SVG <title> tooltip.
 */
function _truncateLabel(label) {
  if (label.length <= 8) return label;
  return label.slice(0, 6) + '…';
}

/**
 * Determine the type of an NFA state for rendering purposes.
 * (NFA class doesn't have a stateType() method like DFA does.)
 */
function _nfaStateType(nfa, state) {
  const isStart  = state === nfa.startState;
  const isAccept = nfa.acceptStates.has(state);
  if (isStart && isAccept) return 'start-accept';
  if (isStart)  return 'start';
  if (isAccept) return 'accept';
  return 'normal';
}


// 
//  ADDITIONAL CSS INJECTED AT RUNTIME
//  (step phase badges — too dynamic for static stylesheet)
// 
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
    .dead-node    { opacity: 0.45; }
    .node-circle.sim-active {
      stroke-width: 3;
      filter: drop-shadow(0 0 8px currentColor);
    }
  `;
  document.head.appendChild(style);
})();


// 
//  11. BOOT — attach all event listeners on DOMContentLoaded
// 
document.addEventListener('DOMContentLoaded', () => {

  // Core actions
  UI.btnConvert.addEventListener('click', handleConvert);
  UI.btnBuildTable.addEventListener('click', buildTransitionTable);
  UI.btnClear.addEventListener('click', clearAll);

  // Simulator
  UI.btnSimulate.addEventListener('click', handleSimulate);
  UI.btnSimPrev.addEventListener('click', handleSimPrev);
  UI.btnSimNext.addEventListener('click', handleSimNext);

  // Keyboard shortcut: Enter on string input triggers simulate
  UI.inputString.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSimulate();
  });

  // Preset dropdown toggle
  UI.btnLoadPreset.addEventListener('click', () => {
    UI.presetDropdown.hidden = !UI.presetDropdown.hidden;
  });

  // Close preset dropdown when clicking outside the preset-wrap
  document.addEventListener('click', e => {
    if (!UI.presetDropdown.hidden &&
        !UI.btnLoadPreset.closest('.preset-wrap').contains(e.target)) {
      UI.presetDropdown.hidden = true;
    }
  });

  // Auto-rebuild table when states or alphabet change
  [UI.inputStates, UI.inputAlpha].forEach(input => {
    input.addEventListener('change', () => {
      if (UI.transitionWrap.querySelector('table')) {
        buildTransitionTable();
      }
    });
  });

  // Close picker when clicking outside
  document.addEventListener('click', e => {
    if (_picker.popup && !_picker.popup.contains(e.target)) {
      _closePicker();
    }
  });

  // Close picker on scroll (prevents misaligned popup)
  window.addEventListener('scroll', _closePicker, true);

  // Tabs
  initTabs();

  // Presets
  initPresets();
});