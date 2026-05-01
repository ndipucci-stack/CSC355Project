// nfa.js — NFA model + the subset construction (NFA → DFA)

// the NFA class holds the machine and exposes:
//   epsilonClosure(states), move(states, symbol), and toDFA()
class NFA {

  // states/alphabet/acceptStates are arrays
  // transitions is the raw nested object out of the UI
  // alphabet does NOT include ε — ε is handled separately
  constructor(states, alphabet, transitions, startState, acceptStates) {
    this.states       = states;
    this.alphabet     = alphabet;
    this.startState   = startState;
    this.acceptStates = new Set(acceptStates);

    // turn the raw object into a nested Map of Sets so we can do
    // transitions.get(state).get(symbol) and get back a Set<string>
    this.transitions  = this._buildTransitionMap(transitions);
  }

  // raw UI object → Map<state, Map<symbol, Set<string>>>
  _buildTransitionMap(raw) {
    const map = new Map();

    for (const state of this.states) {
      map.set(state, new Map());

      // ε is always a possible key even if it's not in the alphabet
      const allSymbols = [...this.alphabet, 'ε'];

      for (const sym of allSymbols) {
        const targets = raw?.[state]?.[sym];

        if (targets && targets.length > 0) {
          // strip out blank entries that come from empty UI cells
          const cleaned = targets
            .map(s => s.trim())
            .filter(s => s.length > 0);

          if (cleaned.length > 0) {
            map.get(state).set(sym, new Set(cleaned));
          }
        }
      }
    }

    return map;
  }

  // raw lookup — no closure, just whatever's in the table
  _getRawTargets(state, symbol) {
    return this.transitions.get(state)?.get(symbol) ?? new Set();
  }

  // ε-closure: from a set of states, follow ε-edges until nothing new
  // shows up. iterative DFS with a stack. input states are always in
  // their own closure.
  epsilonClosure(states) {
    const closure = new Set(states);
    const stack   = [...states];

    while (stack.length > 0) {
      const current = stack.pop();

      // walk every ε-edge out of current
      const epsTargets = this._getRawTargets(current, 'ε');

      for (const next of epsTargets) {
        if (!closure.has(next)) {
          closure.add(next);   // new state — add it
          stack.push(next);    // ...and explore it
        }
      }
    }

    return closure;
  }

  // move: from a set of states, take exactly one step on `symbol`
  // (no ε-closure here — that's the caller's job)
  move(states, symbol) {
    const result = new Set();

    for (const state of states) {
      const targets = this._getRawTargets(state, symbol);
      for (const t of targets) {
        result.add(t);
      }
    }

    return result;
  }

  // subset construction (the main event)
  //
  // 1) ε-closure of start state → DFA start state
  // 2) push it onto a worklist
  // 3) pop a DFA state S, for each symbol a:
  //      T = ε-closure( move(S, a) )
  //      record S --a--> T, queue T if it's new
  // 4) DFA state is accepting if its NFA subset has any accept state
  //
  // returns { dfa: <plain object>, steps: <array of step records> }
  toDFA() {
    // a DFA state is a frozen set of NFA states.
    // we name it "{q0,q2}" so it can be a Map key.
    const setToName = (set) =>
      set.size === 0
        ? '∅'
        : '{' + [...set].sort().join(',') + '}';

    // log of work for the visualizer
    const steps = [];

    // DFA being built
    const dfaTransitions = {};
    const dfaStates      = [];
    const dfaAccepts     = [];

    // step 1: ε-closure of the start state
    const startClosure = this.epsilonClosure(new Set([this.startState]));
    const startName    = setToName(startClosure);

    steps.push({
      phase:       'start',
      dfaState:    startName,
      nfaSubset:   [...startClosure],
      description: `ε-closure({${this.startState}}) = ${startName}  ← DFA start state`
    });

    // worklist + visited tracking
    const visited  = new Set();
    const worklist = [[startName, startClosure]];

    // remember which NFA subset each DFA state name maps to
    const subsetMap = new Map();
    subsetMap.set(startName, startClosure);

    dfaStates.push(startName);
    dfaTransitions[startName] = {};

    // chew through the worklist
    while (worklist.length > 0) {
      const [currentName, currentSubset] = worklist.shift();

      if (visited.has(currentName)) continue;
      visited.add(currentName);

      for (const symbol of this.alphabet) {

        // a) move
        const moved = this.move(currentSubset, symbol);

        // b) ε-closure of the move result
        const closure     = this.epsilonClosure(moved);
        const closureName = setToName(closure);

        // c) record the DFA edge
        dfaTransitions[currentName][symbol] = closureName;

        // d) log it
        steps.push({
          phase:       'transition',
          dfaState:    currentName,
          nfaSubset:   [...currentSubset],
          symbol:      symbol,
          moveResult:  [...moved],
          closure:     [...closure],
          resultState: closureName,
          description: `δ(${currentName}, ${symbol})` +
                       ` = ε-closure(move(_, ${symbol}))` +
                       ` = ε-closure({${[...moved].sort().join(',')}})` +
                       ` = ${closureName}`
        });

        // e) if it's a new DFA state, queue it
        if (!subsetMap.has(closureName)) {
          subsetMap.set(closureName, closure);
          dfaStates.push(closureName);
          dfaTransitions[closureName] = {};
          worklist.push([closureName, closure]);
        }
      }
    }

    // step 4: mark accept states.
    // a DFA state is accepting if its NFA subset contains any NFA accept state
    for (const [name, subset] of subsetMap) {
      for (const nfaState of subset) {
        if (this.acceptStates.has(nfaState)) {
          dfaAccepts.push(name);

          steps.push({
            phase:       'accept',
            dfaState:    name,
            nfaSubset:   [...subset],
            description: `${name} is an accept state` +
                         ` (contains NFA accept state "${nfaState}")`
          });

          break;  // one accept state is enough
        }
      }
    }

    // build the final DFA descriptor
    const dfa = {
      states:       dfaStates,
      alphabet:     [...this.alphabet],
      transitions:  dfaTransitions,
      startState:   startName,
      acceptStates: dfaAccepts,
      subsetMap:    Object.fromEntries(       // keep NFA subsets around for tooltips
        [...subsetMap].map(([k, v]) => [k, [...v]])
      )
    };

    return { dfa, steps };
  }

  // sanity check before running toDFA(). returns { valid, errors }
  validate() {
    const errors = [];

    if (this.states.length === 0)
      errors.push('No states defined.');

    if (this.alphabet.length === 0)
      errors.push('Alphabet is empty.');

    if (!this.startState || !this.states.includes(this.startState))
      errors.push(`Start state "${this.startState}" is not in the state list.`);

    for (const a of this.acceptStates) {
      if (!this.states.includes(a))
        errors.push(`Accept state "${a}" is not in the state list.`);
    }

    // every state in a transition target must actually exist
    for (const [from, symMap] of this.transitions) {
      for (const [sym, targets] of symMap) {
        for (const to of targets) {
          if (!this.states.includes(to))
            errors.push(`Transition ${from} --${sym}--> "${to}": state "${to}" not defined.`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
