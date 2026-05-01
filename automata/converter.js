// converter.js — pipeline glue
// main.js calls this. it takes raw input from the form and returns
// everything the UI needs in one shot.
// pipeline:  raw input → NFA → validate → DFA descriptor → DFA

const Converter = (() => {

  // main entry point
  // input shape: { states, alphabet, transitions, startState, acceptStates, minimize }
  // returns:     { ok, errors, nfa, dfa, minDFA, steps, minimizeSteps }
  function convert(input) {

    // 1) clean up the raw strings
    const parsed = _parseInput(input);

    // 2) build the NFA
    const nfa = new NFA(
      parsed.states,
      parsed.alphabet,
      parsed.transitions,
      parsed.startState,
      parsed.acceptStates
    );

    // 3) validate before running anything heavy
    const { valid, errors } = nfa.validate();
    if (!valid) {
      return { ok: false, errors, nfa, dfa: null, minDFA: null, steps: [], minimizeSteps: null };
    }

    // 4) subset construction (NFA → DFA)
    const { dfa: dfaDescriptor, steps } = nfa.toDFA();
    const dfa = new DFA(dfaDescriptor);

    // 5) optional Moore minimization
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

  // clean up the raw input — trim whitespace, drop empties, dedupe
  function _parseInput(raw) {

    // split "a, b, c" → ["a", "b", "c"]
    const splitClean = (str) =>
      (str ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    // dedupe but keep original order
    const dedup = (arr) => [...new Set(arr)];

    const states       = dedup(splitClean(raw.states));
    const alphabet     = dedup(splitClean(raw.alphabet).filter(s => s !== 'ε'));
    const startState   = (raw.startState ?? '').trim();
    const acceptStates = dedup(splitClean(raw.acceptStates));
    const minimize     = raw.minimize === true;

    // the transitions object can come from the UI table (string cells)
    // or from a preset (already arrays). normalize both into clean arrays.
    const transitions = {};

    for (const state of states) {
      transitions[state] = {};
      const allSymbols = [...alphabet, 'ε'];

      for (const sym of allSymbols) {
        const raw_cell = raw.transitions?.[state]?.[sym];

        if (raw_cell !== undefined && raw_cell !== null) {
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

  // shortcut — build an NFA without converting it (renderer uses this
  // to draw the NFA preview while you're still typing)
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

  // edge list helpers — D3 wants a flat list, not a nested object
  // each edge is { from, to, label }; multiple symbols on the same
  // from→to pair get merged into one comma-joined label.

  // edges from an NFA (includes ε)
  function nfaEdges(nfa) {
    // group by (from, to)
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

  // edges from a DFA
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

  // public API
  return { convert, buildNFA, nfaEdges, dfaEdges };

})();
