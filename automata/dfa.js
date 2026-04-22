// 
//  dfa.js — DFA data model
//
//  Responsibilities:
//    1. Wrap the raw DFA descriptor produced by nfa.js toDFA()
//    2. Detect dead / trap states
//    3. String simulation — step-by-step for the visualizer
// 

class DFA {

  /**
   * @param {Object} descriptor  — the plain object returned by NFA.toDFA()
   *   {
   *     states:       string[]
   *     alphabet:     string[]
   *     transitions:  { [state]: { [symbol]: state } }
   *     startState:   string
   *     acceptStates: string[]
   *     subsetMap:    { [dfaState]: string[] }   < NFA subsets, for tooltips
   *   }
   */
  constructor(descriptor) {
    this.states       = descriptor.states;
    this.alphabet     = descriptor.alphabet;
    this.transitions  = descriptor.transitions;
    this.startState   = descriptor.startState;
    this.acceptStates = new Set(descriptor.acceptStates);
    this.subsetMap    = descriptor.subsetMap ?? {};

    // Derived sets — computed once on construction
    this.deadStates   = this._computeDeadStates();
  }

  // 
  //  INTERNAL HELPER — single transition lookup
  //  Returns the target state or null if undefined
  // 
  _step(state, symbol) {
    return this.transitions[state]?.[symbol] ?? null;
  }

  // 
  //  DEAD STATE DETECTION
  //
  //  A dead (trap) state is one from which NO accept state
  //  is reachable, no matter what symbols are read.
  //
  //  Algorithm: reverse reachability from accept states.
  //    1. Build a reverse transition graph
  //    2. BFS/DFS backwards from every accept state
  //    3. Any state NOT reached is a dead state
  //
  //  This is O(|states| × |alphabet|) — linear in the
  //  size of the transition table.
  //
  //  @return {Set<string>}
  // 
  _computeDeadStates() {

    // 1. Build reverse graph 
    // reverseGraph.get(state) = Set of states that have a
    // transition INTO state on any symbol
    const reverseGraph = new Map();
    for (const s of this.states) reverseGraph.set(s, new Set());

    for (const from of this.states) {
      for (const sym of this.alphabet) {
        const to = this._step(from, sym);
        if (to && reverseGraph.has(to)) {
          reverseGraph.get(to).add(from);
        }
      }
    }

    //  2. BFS backwards from all accept states 
    const canReachAccept = new Set(this.acceptStates);
    const queue = [...this.acceptStates];

    while (queue.length > 0) {
      const current = queue.shift();
      for (const predecessor of (reverseGraph.get(current) ?? [])) {
        if (!canReachAccept.has(predecessor)) {
          canReachAccept.add(predecessor);
          queue.push(predecessor);
        }
      }
    }

    // Dead = everything NOT in canReachAccept 
    const dead = new Set();
    for (const s of this.states) {
      if (!canReachAccept.has(s)) dead.add(s);
    }

    return dead;
  }

  // 
  //  STATE TYPE HELPERS
  // 

  isAccept(state) { return this.acceptStates.has(state); }
  isDead(state)   { return this.deadStates.has(state); }
  isStart(state)  { return state === this.startState; }

  /**
   * Returns 'start-accept' | 'start' | 'accept' | 'dead' | 'normal'
   * Used by the renderer to pick node styling.
   */
  stateType(state) {
    const start  = this.isStart(state);
    const accept = this.isAccept(state);
    const dead   = this.isDead(state);
    if (start && accept) return 'start-accept';
    if (start)           return 'start';
    if (accept)          return 'accept';
    if (dead)            return 'dead';
    return 'normal';
  }

  // 
  //  STRING SIMULATION
  //
  //  Runs the DFA on an input string and returns a trace —
  //  one record per symbol consumed — so the visualizer can
  //  animate the active state step by step.
  //
  //  Each record in the trace:
  //  {
  //    stepIndex:    number      — 0-based position in string
  //    symbol:       string      — symbol just consumed
  //    fromState:    string      — state before consuming
  //    toState:      string|null — state after (null = no transition)
  //    isStuck:      boolean     — true if no transition existed
  //  }
  //
  //  Final result record (after all symbols consumed):
  //  {
  //    stepIndex:  inputLength
  //    symbol:     null
  //    fromState:  final state
  //    toState:    null
  //    accepted:   boolean
  //    isStuck:    boolean
  //  }
  //
  //  @param  {string}   inputString
  //  @return {{ accepted: boolean, trace: Object[] }}
  // 
  simulate(inputString) {
    const symbols = [...inputString];   // split handles multi-char symbols
    const trace   = [];

    let current = this.startState;
    let stuck   = false;

    // ── Initial record: before any symbol is read 
    trace.push({
      stepIndex:  -1,
      symbol:     null,
      fromState:  null,
      toState:    current,
      isStuck:    false,
      accepted:   false,
      isInitial:  true
    });

    // ── Process each symbol 
    for (let i = 0; i < symbols.length; i++) {
      const sym  = symbols[i];
      const next = this._step(current, sym);

      if (next === null) {
        // No transition — machine is stuck (implicit reject)
        trace.push({
          stepIndex: i,
          symbol:    sym,
          fromState: current,
          toState:   null,
          isStuck:   true,
          accepted:  false
        });
        stuck = true;
        break;
      }

      trace.push({
        stepIndex: i,
        symbol:    sym,
        fromState: current,
        toState:   next,
        isStuck:   false,
        accepted:  false
      });

      current = next;
    }

    //  Final record 
    const accepted = !stuck && this.isAccept(current);

    trace.push({
      stepIndex: symbols.length,
      symbol:    null,
      fromState: current,
      toState:   null,
      isStuck:   stuck,
      accepted:  accepted,
      isFinal:   true
    });

    return { accepted, trace };
  }

  // 
  //  EXPORT
  //  Returns a plain serialisable object — useful for
  //  saving state or passing to a renderer.
  // 
  toDescriptor() {
    return {
      states:       [...this.states],
      alphabet:     [...this.alphabet],
      transitions:  this.transitions,
      startState:   this.startState,
      acceptStates: [...this.acceptStates],
      deadStates:   [...this.deadStates],
      subsetMap:    this.subsetMap
    };
  }

  // 
  //  SUMMARY  — for the UI info panel
  // 
  summary() {
    return {
      totalStates:  this.states.length,
      acceptStates: this.acceptStates.size,
      deadStates:   this.deadStates.size,
      alphabet:     this.alphabet.length
    };
  }
}