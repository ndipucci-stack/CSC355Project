//  converter.js — Pipeline orchestrator
//
//  Single entry point that main.js calls.
//  Responsibility: take raw UI input → return everything the
//  UI needs in one clean result object.
//
//  Pipeline:
//    raw input > NFA > (validate) >  DFA descriptor > DFA
//                                     

const Converter = (() => {

  //  MAIN ENTRY POINT
  //
  //  @param {Object} input
  //    {
  //      states:       string[]   — e.g. ['q0','q1','q2']
  //      alphabet:     string[]   — e.g. ['a','b']
  //      transitions:  Object     — { q0: { a: ['q1'] }, ... }
  //      startState:   string
  //      acceptStates: string[]
  //      minimize:     boolean    — run Moore's after conversion
  //    }
  //
  //  @return {Object}
  //    {
  //      ok:           boolean
  //      errors:       string[]        — populated if ok = false
  //      nfa:          NFA             — the built NFA instance
  //      dfa:          DFA             — converted DFA
  //      minDFA:       DFA | null      — minimized DFA, or null
  //      steps:        Object[]        — subset construction log
  //      minimizeSteps: Object[] | null — Moore's step log
  //    }
  function convert(input) {

    // Parse & sanitize raw input 
    const parsed = _parseInput(input);

    //Build NFA 
    const nfa = new NFA(
      parsed.states,
      parsed.alphabet,
      parsed.transitions,
      parsed.startState,
      parsed.acceptStates
    );

    // ── 3. Validate before running algorithm 
    const { valid, errors } = nfa.validate();
    if (!valid) {
      return { ok: false, errors, nfa, dfa: null, minDFA: null, steps: [], minimizeSteps: null };
    }

    // ── 4. Powerset construction (NFA → DFA) 
    const { dfa: dfaDescriptor, steps } = nfa.toDFA();
    const dfa = new DFA(dfaDescriptor);

    // ── 5. Optional minimization (Moore's algorithm) 
    let minDFA          = null;
    let minimizeSteps   = null;

    if (parsed.minimize) {
      const result  = Minimizer.minimize(dfa);
      minDFA        = result.dfa;
      minimizeSteps = result.steps;
    }

    return {
      ok:            true,
      errors:        [],
      nfa,
      dfa,
      minDFA,
      steps,
      minimizeSteps
    };
  }

  //  INPUT PARSER
  //  Cleans and normalizes the raw strings coming from the UI.
  //  Handles whitespace, empty cells, duplicate entries.
  function _parseInput(raw) {

    // Helper: split a comma-separated string into a clean array
    const splitClean = (str) =>
      (str ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    // Helper: deduplicate while preserving order
    const dedup = (arr) => [...new Set(arr)];

    const states       = dedup(splitClean(raw.states));
    const alphabet     = dedup(splitClean(raw.alphabet).filter(s => s !== 'ε'));
    const startState   = (raw.startState ?? '').trim();
    const acceptStates = dedup(splitClean(raw.acceptStates));
    const minimize     = raw.minimize === true;

    // Transitions come in as a nested object from the UI table.
    // Each cell value is a comma-separated string of target states.
    // We normalise each cell into a clean string array.
    const transitions = {};

    for (const state of states) {
      transitions[state] = {};
      const allSymbols = [...alphabet, 'ε'];

      for (const sym of allSymbols) {
        const raw_cell = raw.transitions?.[state]?.[sym];

        if (raw_cell !== undefined && raw_cell !== null) {
          // Cell may be already an array (from presets) or a string (from UI input)
          const targets = Array.isArray(raw_cell)
            ? raw_cell
            : splitClean(String(raw_cell));

          const cleaned = dedup(targets.filter(t => t.length > 0));
          if (cleaned.length > 0) {
            transitions[state][sym] = cleaned;
          }
        }
      }
    }

    return { states, alphabet, transitions, startState, acceptStates, minimize };
  }

  //  CONVENIENCE — build an NFA instance from raw input
  //  without running conversion.
  //  Used by the renderer to draw the NFA before converting.
  function buildNFA(input) {
    const parsed = _parseInput(input);
    return new NFA(
      parsed.states,
      parsed.alphabet,
      parsed.transitions,
      parsed.startState,
      parsed.acceptStates
    );
  }

  
  //  EDGE LIST HELPERS
  //  The D3 renderer wants a flat list of edges, not a
  //  nested transition object. These helpers produce that.
  //
  //  Each edge: { from, to, label }
  //  When multiple symbols share the same from→to pair they
  //  are merged into one edge with a comma-joined label,
  //  keeping the graph clean.
  /**
   * Build edge list from an NFA instance.
   * Includes ε-transitions if present.
   */
  function nfaEdges(nfa) {
    // Group symbols by (from, to) pair
    const edgeMap = new Map();

    for (const [from, symMap] of nfa.transitions) {
      for (const [sym, targets] of symMap) {
        for (const to of targets) {
          const key = `${from}→${to}`;
          if (!edgeMap.has(key)) edgeMap.set(key, { from, to, symbols: [] });
          edgeMap.get(key).symbols.push(sym);
        }
      }
    }

    return [...edgeMap.values()].map(e => ({
      from:  e.from,
      to:    e.to,
      label: e.symbols.sort().join(', ')
    }));
  }

  /**
   * Build edge list from a DFA instance.
   */
  function dfaEdges(dfa) {
    const edgeMap = new Map();

    for (const from of dfa.states) {
      for (const sym of dfa.alphabet) {
        const to = dfa.transitions[from]?.[sym];
        if (!to) continue;
        const key = `${from}→${to}`;
        if (!edgeMap.has(key)) edgeMap.set(key, { from, to, symbols: [] });
        edgeMap.get(key).symbols.push(sym);
      }
    }

    return [...edgeMap.values()].map(e => ({
      from:  e.from,
      to:    e.to,
      label: e.symbols.sort().join(', ')
    }));
  }

  // Public API
  return { convert, buildNFA, nfaEdges, dfaEdges };

})();