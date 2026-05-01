// dfa.js — DFA data model
// wraps the descriptor object spit out by NFA.toDFA(),
// figures out which states are dead, and runs string sims

class DFA {

  // descriptor shape:
  //   states, alphabet, transitions, startState, acceptStates, subsetMap
  constructor(descriptor) {
    this.states       = descriptor.states;
    this.alphabet     = descriptor.alphabet;
    this.transitions  = descriptor.transitions;
    this.startState   = descriptor.startState;
    this.acceptStates = new Set(descriptor.acceptStates);
    this.subsetMap    = descriptor.subsetMap ?? {};

    // figure out dead states up front so we don't redo it later
    this.deadStates   = this._computeDeadStates();
  }

  // single-step lookup — returns the next state or null
  _step(state, symbol) {
    return this.transitions[state]?.[symbol] ?? null;
  }

  // dead state = can't reach an accept state no matter what
  // trick: build the reverse graph, BFS backwards from accept states,
  // anything we don't visit is dead
  _computeDeadStates() {

    // reverseGraph.get(s) = states that point INTO s
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

    // BFS backwards starting from every accept state
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

    // anything we didn't reach = dead
    const dead = new Set();
    for (const s of this.states) {
      if (!canReachAccept.has(s)) dead.add(s);
    }

    return dead;
  }

  // tiny state-type helpers used by the renderer
  isAccept(state) { return this.acceptStates.has(state); }
  isDead(state)   { return this.deadStates.has(state); }
  isStart(state)  { return state === this.startState; }

  // returns the type the renderer needs to pick a color
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

  // run the DFA on an input string
  // returns { accepted, trace } where trace is one record per step
  // so the simulator UI can step through symbol by symbol
  simulate(inputString) {
    const symbols = [...inputString];   // spread handles weird unicode/multi-char
    const trace   = [];

    let current = this.startState;
    let stuck   = false;

    // initial record — before reading anything
    trace.push({
      stepIndex:  -1,
      symbol:     null,
      fromState:  null,
      toState:    current,
      isStuck:    false,
      accepted:   false,
      isInitial:  true
    });

    // chew through each symbol
    for (let i = 0; i < symbols.length; i++) {
      const sym  = symbols[i];
      const next = this._step(current, sym);

      if (next === null) {
        // no transition defined — dead end, reject
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

    // final record — accept iff we landed on an accept state
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

  // dump everything back to a plain object (useful for saving/passing around)
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

  // quick stats for an info panel
  summary() {
    return {
      totalStates:  this.states.length,
      acceptStates: this.acceptStates.size,
      deadStates:   this.deadStates.size,
      alphabet:     this.alphabet.length
    };
  }
}
