// 
//  minimizer.js — Moore's Algorithm (DFA Minimization)
//
//  Takes a fully built DFA instance.
//  Returns a minimized equivalent DFA + a step log for the
//  visualizer showing how partitions were refined.
//
//  Algorithm overview
//  Moore's algorithm works by partition refinement:
//
//  1. REMOVE unreachable states first (they can confuse
//     the partition logic and bloat the result)
//
//  2. INITIAL PARTITION — two groups:
//       P0 = accept states
//       P1 = non-accept states
//
//  3. REFINEMENT LOOP — repeat until stable:
//       For every group G in the current partition:
//         For every symbol a in the alphabet:
//           Check where each state in G goes on symbol a.
//           If two states in G land in DIFFERENT groups,
//           they are distinguishable → split G.
//       Replace G with the resulting sub-groups.
//
//  4. BUILD minimized DFA:
//       Each final group becomes one DFA state.
//       Representative state = first member of the group.
//       Transitions follow from any representative.
//       Accept states = groups containing an original accept state.

const Minimizer = (() => {

  // 
  //  PUBLIC ENTRY POINT
  //
  //  @param  {DFA}    dfa
  //  @return {{ dfa: DFA, steps: Object[] }}
  // 
  function minimize(dfa) {
    const steps = [];

    //  STEP 1: remove unreachable states 
    const reachable = _reachableStates(dfa);

    const removedCount = dfa.states.length - reachable.size;
    steps.push({
      phase:       'reachability',
      reachable:   [...reachable],
      removed:     dfa.states.filter(s => !reachable.has(s)),
      description: removedCount > 0
        ? `Removed ${removedCount} unreachable state(s): ` +
          dfa.states.filter(s => !reachable.has(s)).join(', ')
        : 'All states are reachable — nothing removed.'
    });

    // Work only with reachable states from here on
    const states   = dfa.states.filter(s => reachable.has(s));
    const alphabet = dfa.alphabet;

    // ── STEP 2: initial partition 
    // Group 0 = accept states (that are reachable)
    // Group 1 = non-accept states (that are reachable)
    const acceptGroup    = states.filter(s => dfa.isAccept(s));
    const nonAcceptGroup = states.filter(s => !dfa.isAccept(s));

    // partitions = array of groups, each group = array of state names
    let partitions = [];
    if (acceptGroup.length > 0)    partitions.push(acceptGroup);
    if (nonAcceptGroup.length > 0) partitions.push(nonAcceptGroup);

    steps.push({
      phase:       'initial-partition',
      partitions:  partitions.map(g => [...g]),
      description: `Initial partition: ` +
        partitions.map((g, i) => `P${i}={${g.join(',')}}`).join(' | ')
    });

    //  STEP 3: refinement loop 
    let iteration = 0;

    while (true) {
      iteration++;
      const newPartitions = [];
      let   didSplit      = false;

      for (const group of partitions) {

        // A group with one state can never be split
        if (group.length === 1) {
          newPartitions.push(group);
          continue;
        }

        // Try to split this group on every symbol
        const splits = _splitGroup(group, alphabet, partitions, dfa);

        if (splits.length > 1) {
          // This group was split into 2+ sub-groups
          didSplit = true;
          newPartitions.push(...splits);

          steps.push({
            phase:       'split',
            iteration,
            original:    [...group],
            splits:      splits.map(g => [...g]),
            description: `Iteration ${iteration}: split {${group.join(',')}} → ` +
              splits.map(g => `{${g.join(',')}}`).join(' | ')
          });

        } else {
          // No split — group stays intact
          newPartitions.push(group);
        }
      }

      partitions = newPartitions;

      if (!didSplit) {
        // Partition is stable — algorithm terminates
        steps.push({
          phase:       'stable',
          iteration,
          partitions:  partitions.map(g => [...g]),
          description: `Iteration ${iteration}: no splits — partition is stable.` +
            ` Final: ` + partitions.map(g => `{${g.join(',')}}`).join(' | ')
        });
        break;
      }
    }

    //  STEP 4: build minimized DFA 
    const minDescriptor = _buildMinDFA(partitions, dfa, steps);
    const minDFA        = new DFA(minDescriptor);

    steps.push({
      phase:       'result',
      originalCount: states.length,
      minimizedCount: minDFA.states.length,
      merged:       states.length - minDFA.states.length,
      description: `Minimization complete. ` +
        `${states.length} states → ${minDFA.states.length} states ` +
        `(${states.length - minDFA.states.length} merged).`
    });

    return { dfa: minDFA, steps };
  }

  // 
  //  REACHABLE STATES
  //  BFS from start state — anything not visited is unreachable.
  // 
  function _reachableStates(dfa) {
    const visited = new Set([dfa.startState]);
    const queue   = [dfa.startState];

    while (queue.length > 0) {
      const current = queue.shift();
      for (const sym of dfa.alphabet) {
        const next = dfa.transitions[current]?.[sym];
        if (next && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    return visited;
  }

  
  //  SPLIT GROUP
  //
  //  Given a group of states, try to split it by checking
  //  whether every state transitions to the SAME partition
  //  group on every symbol.
  //
  //  Two states p, q are distinguishable in this round if
  //  there exists a symbol a such that:
  //    partitionOf(δ(p,a)) ≠ partitionOf(δ(q,a))
  //
  //  Returns an array of sub-groups (length 1 = no split).
  function _splitGroup(group, alphabet, partitions, dfa) {

    // Build a lookup: state → partition index
    const partitionIndex = new Map();
    for (let i = 0; i < partitions.length; i++) {
      for (const s of partitions[i]) {
        partitionIndex.set(s, i);
      }
    }

    //  Compute a "signature" for each state 
    // Signature = tuple of partition indices the state goes to
    // on each symbol, in alphabet order.
    // States with identical signatures stay in the same group.
    const signatureOf = (state) =>
      alphabet.map(sym => {
        const target = dfa.transitions[state]?.[sym];
        if (!target) return -1;                     // no transition → dead/-1
        return partitionIndex.get(target) ?? -1;    // target not in partition → -1
      }).join('|');

    //  Group states by signature 
    const buckets = new Map();  // signature → [states]

    for (const state of group) {
      const sig = signatureOf(state);
      if (!buckets.has(sig)) buckets.set(sig, []);
      buckets.get(sig).push(state);
    }

    // Return the sub-groups (order preserved as insertion order)
    return [...buckets.values()];
  }

  //  BUILD MINIMIZED DFA
  //
  //  Each partition group → one DFA state.
  //  Name = sorted, joined member names wrapped in braces,
  //  unless the group has one member (keep original name).
  //  Representative = first member of each group.
  function _buildMinDFA(partitions, dfa, steps) {

    //  Name each partition group 
    const groupName = (group) =>
      group.length === 1
        ? group[0]
        : '{' + [...group].sort().join(',') + '}';

    const names = partitions.map(groupName);

    //  Map every original state to tis group name 
    const stateToGroup = new Map();
    for (let i = 0; i < partitions.length; i++) {
      for (const s of partitions[i]) {
        stateToGroup.set(s, names[i]);
      }
    }

    //  Transitions 
    // Follow representative (first member) of each group
    const transitions = {};
    for (let i = 0; i < partitions.length; i++) {
      const rep  = partitions[i][0];   // representative
      const name = names[i];
      transitions[name] = {};

      for (const sym of dfa.alphabet) {
        const target = dfa.transitions[rep]?.[sym];
        if (target) {
          transitions[name][sym] = stateToGroup.get(target) ?? target;
        }
      }
    }

    //  Start state 
    const startName = stateToGroup.get(dfa.startState);

    //  Accept states 
    const acceptNames = [];
    for (let i = 0; i < partitions.length; i++) {
      // Group is accepting if ANY member is an original accept state
      if (partitions[i].some(s => dfa.isAccept(s))) {
        acceptNames.push(names[i]);
      }
    }

    //  Rebuild subsetMap for tooltips 
    // Each minimized state maps to the union of NFA subsets
    // of all the DFA states it absorbed
    const subsetMap = {};
    for (let i = 0; i < partitions.length; i++) {
      const name    = names[i];
      const nfaUnion = new Set();
      for (const dfaState of partitions[i]) {
        const nfaStates = dfa.subsetMap?.[dfaState] ?? [];
        for (const n of nfaStates) nfaUnion.add(n);
      }
      subsetMap[name] = [...nfaUnion];
    }

    //  Log merged groups 
    for (let i = 0; i < partitions.length; i++) {
      if (partitions[i].length > 1) {
        steps.push({
          phase:       'merge',
          group:       partitions[i],
          mergedName:  names[i],
          description: `Merge {${partitions[i].join(',')}} → state "${names[i]}"`
        });
      }
    }

    return {
      states:       names,
      alphabet:     [...dfa.alphabet],
      transitions,
      startState:   startName,
      acceptStates: acceptNames,
      subsetMap
    };
  }

  // Public API
  return { minimize };

})();