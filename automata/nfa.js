// 
//  nfa.js — NFA data model + Subset Construction (NFA → DFA)
// 

// 
//  NFA CLASS
//  Stores the automaton and exposes the two core helpers:
//    • epsilonClosure(states)
//    • move(states, symbol)
//  Plus the full subset construction conversion.
// 

class NFA {

  /**
   * @param {string[]} states       - e.g. ['q0','q1','q2']
   * @param {string[]} alphabet     - e.g. ['a','b']  (no ε here)
   * @param {Object}   transitions  - raw table from UI, shape:
   *                                  { q0: { a: ['q1'], ε: ['q2'] }, ... }
   * @param {string}   startState
   * @param {string[]} acceptStates
   */
  constructor(states, alphabet, transitions, startState, acceptStates) {
    this.states       = states;
    this.alphabet     = alphabet;          // does NOT include ε
    this.startState   = startState;
    this.acceptStates = new Set(acceptStates);

    // Build a clean nested Map from the raw object coming out of the UI
    // transitions.get(state).get(symbol) => Set<string>
    this.transitions  = this._buildTransitionMap(transitions);
  }

  // 
  //  INTERNAL: convert raw UI object → nested Map of Sets
  // 
  _buildTransitionMap(raw) {
    const map = new Map();

    for (const state of this.states) {
      map.set(state, new Map());

      // Include ε as a possible key even if not in alphabet array
      const allSymbols = [...this.alphabet, 'ε'];

      for (const sym of allSymbols) {
        const targets = raw?.[state]?.[sym];

        if (targets && targets.length > 0) {
          // Filter out empty strings that can come from blank table cells
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

  // 
  //  HELPER: get the Set of states reachable from one state
  //  on one symbol (raw transition lookup, no closure)
  // 
  _getRawTargets(state, symbol) {
    return this.transitions.get(state)?.get(symbol) ?? new Set();
  }

  // 
  //  CORE HELPER 1 — ε-CLOSURE
  //
  //  Given a set of NFA states, return every state reachable
  //  by following ε-transitions only (zero or more steps).
  //  The input states themselves are always included.
  //
  //  Algorithm: iterative DFS using a stack.
  //
  //  @param  {Set<string>|string[]}  states
  //  @return {Set<string>}
  // 
  epsilonClosure(states) {
    const closure = new Set(states);   // start: every input state is in its own ε-closure
    const stack   = [...states];       // worklist — states yet to be explored

    while (stack.length > 0) {
      const current = stack.pop();

      // Follow every ε-edge out of current
      const epsTargets = this._getRawTargets(current, 'ε');

      for (const next of epsTargets) {
        if (!closure.has(next)) {
          closure.add(next);   // discovered a new state
          stack.push(next);    // schedule it for exploration
        }
      }
    }

    return closure;
  }

  // 
  //  CORE HELPER 2 — MOVE
  //
  //  Given a set of NFA states and a non-ε symbol,
  //  return every state reachable in exactly ONE step
  //  on that symbol (ε-closure is NOT applied here).
  //
  //  @param  {Set<string>}  states
  //  @param  {string}       symbol
  //  @return {Set<string>}
  // 
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

  // 
  //  SUBSET CONSTRUCTION  (NFA → DFA)
  //
  //  Returns { dfa, steps } where:
  //    dfa   — a plain object the DFA class can consume
  //    steps — array of step records for the visualizer log
  //
  //  Algorithm outline
  //  
  //  1. Compute ε-closure of the NFA start state
  //     → this becomes the DFA start state
  //
  //  2. Push it onto a worklist of "unprocessed DFA states"
  //
  //  3. While worklist is not empty:
  //       take a DFA state S (a frozen set of NFA states)
  //       for each symbol a in the alphabet:
  //         T = ε-closure( move(S, a) )
  //         record the DFA transition S --a--> T
  //         if T is new, add it to worklist
  //
  //  4. Any DFA state whose NFA subset contains an NFA
  //     accept state becomes a DFA accept state
  //
  //  @return {{ dfa: Object, steps: Object[] }}
  // 
  toDFA() {
    //  Naming helper 
    // A DFA state is a frozenset of NFA states.
    // We represent it as a sorted, comma-joined string so it
    // can be used as a Map key.
    // e.g.  Set{'q0','q2'} → "{q0,q2}"
    const setToName = (set) =>
      set.size === 0
        ? '∅'
        : '{' + [...set].sort().join(',') + '}';

    //  Step log 
    // Each entry describes one row of work the algorithm did.
    const steps = [];

    //  DFA bookkeeping 
    const dfaTransitions = {};   // { dfaState: { symbol: dfaState } }
    const dfaStates      = [];   // ordered list of discovered DFA states
    const dfaAccepts     = [];

    //  STEP 1: ε-closure of start state 
    const startClosure = this.epsilonClosure(new Set([this.startState]));
    const startName    = setToName(startClosure);

    steps.push({
      phase:       'start',
      dfaState:    startName,
      nfaSubset:   [...startClosure],
      description: `ε-closure({${this.startState}}) = ${startName}  ← DFA start state`
    });

    // nitialise worklist 
    // visited  : set of DFA state names already fully processed
    // worklist : queue of [dfaStateName, nfaSubsetSet] pairs
    const visited  = new Set();
    const worklist = [[startName, startClosure]];

    // Map from DFA state name → its NFA subset (Set)
    const subsetMap = new Map();
    subsetMap.set(startName, startClosure);

    dfaStates.push(startName);
    dfaTransitions[startName] = {};

    // process worklist 
    while (worklist.length > 0) {
      const [currentName, currentSubset] = worklist.shift();

      if (visited.has(currentName)) continue;
      visited.add(currentName);

      // For each non-ε symbol in the alphabet
      for (const symbol of this.alphabet) {

        // a. Compute move
        const moved = this.move(currentSubset, symbol);

        // b. Compute ε-closure of the move result
        const closure     = this.epsilonClosure(moved);
        const closureName = setToName(closure);

        // c. Record the DFA transition
        dfaTransitions[currentName][symbol] = closureName;

        // d. Log this step
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

        // e. If this DFA state is new, add to worklist
        if (!subsetMap.has(closureName)) {
          subsetMap.set(closureName, closure);
          dfaStates.push(closureName);
          dfaTransitions[closureName] = {};
          worklist.push([closureName, closure]);
        }
      }
    }

    //  STEP 4: mark DFA accept states 
    // A DFA state is accepting if its NFA subset contains
    // at least one NFA accept state.
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

          break;  // only need one NFA accept state to qualify
        }
      }
    }

    //  Build the final DFA descriptor object 
    const dfa = {
      states:       dfaStates,
      alphabet:     [...this.alphabet],
      transitions:  dfaTransitions,
      startState:   startName,
      acceptStates: dfaAccepts,
      subsetMap:    Object.fromEntries(       // for tooltip: DFA state → NFA subset
        [...subsetMap].map(([k, v]) => [k, [...v]])
      )
    };

    return { dfa, steps };
  }

  // 
  //  VALIDATION
  //  Call before running toDFA() to catch user input errors.
  //  Returns { valid: bool, errors: string[] }
  // 
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

    // Check that every state referenced in transitions actually exists
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