// minimizer.js — Moore's algorithm for DFA minimization
// takes a DFA, returns a minimized one + a step log for the visualizer.
//
// the idea, in short:
//   1. drop any unreachable states (they only confuse the partitions)
//   2. start with two groups: accept states vs everything else
//   3. keep splitting groups whenever two states in the same group
//      go to different groups on the same symbol — that means they're
//      distinguishable. stop when nothing splits anymore.
//   4. each final group becomes one state in the minimized DFA.

const Minimizer = (() => {

  // public entry point
  // input:  a DFA instance
  // output: { dfa: <minimized DFA>, steps: <step log array> }
  function minimize(dfa) {
    const steps = [];

    // step 1: kill unreachable states
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

    // from here on we only care about reachable states
    const states   = dfa.states.filter(s => reachable.has(s));
    const alphabet = dfa.alphabet;

    // step 2: starting partition
    //   group 0 = accept states (that are reachable)
    //   group 1 = non-accept states (that are reachable)
    const acceptGroup    = states.filter(s => dfa.isAccept(s));
    const nonAcceptGroup = states.filter(s => !dfa.isAccept(s));

    let partitions = [];
    if (acceptGroup.length > 0)    partitions.push(acceptGroup);
    if (nonAcceptGroup.length > 0) partitions.push(nonAcceptGroup);

    steps.push({
      phase:       'initial-partition',
      partitions:  partitions.map(g => [...g]),
      description: `Initial partition: ` +
        partitions.map((g, i) => `P${i}={${g.join(',')}}`).join(' | ')
    });

    // step 3: keep splitting until nothing changes
    let iteration = 0;

    while (true) {
      iteration++;
      const newPartitions = [];
      let   didSplit      = false;

      for (const group of partitions) {

        // singletons can't split
        if (group.length === 1) {
          newPartitions.push(group);
          continue;
        }

        const splits = _splitGroup(group, alphabet, partitions, dfa);

        if (splits.length > 1) {
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
          newPartitions.push(group);
        }
      }

      partitions = newPartitions;

      if (!didSplit) {
        // stable — we're done
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

    // step 4: build the minimized DFA from the final partitions
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

  // BFS from the start state. anything we don't visit is unreachable.
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

  // try to split a group based on where its members go on each symbol.
  // two states are distinguishable in this round if they land in
  // different partitions on at least one symbol.
  // returns the new sub-groups (length 1 = no split happened).
  function _splitGroup(group, alphabet, partitions, dfa) {

    // lookup: state → which partition it's in
    const partitionIndex = new Map();
    for (let i = 0; i < partitions.length; i++) {
      for (const s of partitions[i]) {
        partitionIndex.set(s, i);
      }
    }

    // signature = list of partition indices the state goes to
    // on each symbol. same signature → same group.
    const signatureOf = (state) =>
      alphabet.map(sym => {
        const target = dfa.transitions[state]?.[sym];
        if (!target) return -1;                     // no transition (dead end)
        return partitionIndex.get(target) ?? -1;
      }).join('|');

    // bucket by signature
    const buckets = new Map();

    for (const state of group) {
      const sig = signatureOf(state);
      if (!buckets.has(sig)) buckets.set(sig, []);
      buckets.get(sig).push(state);
    }

    return [...buckets.values()];
  }

  // turn the final partitions into a real DFA descriptor.
  // each group becomes one state. name is "{a,b}" if multiple, else just the name.
  // representative state for transitions = the first member.
  function _buildMinDFA(partitions, dfa, steps) {

    const groupName = (group) =>
      group.length === 1
        ? group[0]
        : '{' + [...group].sort().join(',') + '}';

    const names = partitions.map(groupName);

    // every original state → its group's name
    const stateToGroup = new Map();
    for (let i = 0; i < partitions.length; i++) {
      for (const s of partitions[i]) {
        stateToGroup.set(s, names[i]);
      }
    }

    // transitions — follow the rep of each group
    const transitions = {};
    for (let i = 0; i < partitions.length; i++) {
      const rep  = partitions[i][0];
      const name = names[i];
      transitions[name] = {};

      for (const sym of dfa.alphabet) {
        const target = dfa.transitions[rep]?.[sym];
        if (target) {
          transitions[name][sym] = stateToGroup.get(target) ?? target;
        }
      }
    }

    // start state = whatever group the original start belongs to
    const startName = stateToGroup.get(dfa.startState);

    // accept = any group that contains an original accept state
    const acceptNames = [];
    for (let i = 0; i < partitions.length; i++) {
      if (partitions[i].some(s => dfa.isAccept(s))) {
        acceptNames.push(names[i]);
      }
    }

    // rebuild the NFA-subset map for tooltips
    // each merged state = union of NFA subsets it absorbed
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

    // log every group we actually merged
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

  // public API
  return { minimize };

})();
