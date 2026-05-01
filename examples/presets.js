// presets.js — example NFAs the user can load from the dropdown
// each one has a name, short description, and full NFA definition

const PRESETS = [

  {
    name:         'Ends in "ab"',
    desc:         'Strings over {a,b} whose last two chars are ab',
    states:       ['q0', 'q1', 'q2'],
    alphabet:     ['a', 'b'],
    startState:   'q0',
    acceptStates: ['q2'],
    transitions: {
      q0: { a: ['q0', 'q1'], b: ['q0'] },
      q1: { b: ['q2'] },
      q2: {}
    }
  },

  {
    name:         'Contains "aa"',
    desc:         'Strings over {a,b} containing at least one "aa"',
    states:       ['q0', 'q1', 'q2'],
    alphabet:     ['a', 'b'],
    startState:   'q0',
    acceptStates: ['q2'],
    transitions: {
      q0: { a: ['q0', 'q1'], b: ['q0'] },
      q1: { a: ['q2'] },
      q2: { a: ['q2'], b: ['q2'] }
    }
  },

  {
    name:         'ε-NFA: a\'s OR b\'s',
    desc:         'One or more a\'s, or one or more b\'s',
    states:       ['q0', 'q1', 'q2', 'q3', 'q4'],
    alphabet:     ['a', 'b'],
    startState:   'q0',
    acceptStates: ['q2', 'q4'],
    transitions: {
      q0: { 'ε': ['q1', 'q3'] },
      q1: { a:   ['q2'] },
      q2: { a:   ['q2'] },
      q3: { b:   ['q4'] },
      q4: { b:   ['q4'] }
    }
  },

  {
    name:         'Binary divisible by 3',
    desc:         'Binary strings whose value is divisible by 3',
    states:       ['r0', 'r1', 'r2'],
    alphabet:     ['0', '1'],
    startState:   'r0',
    acceptStates: ['r0'],
    transitions: {
      r0: { '0': ['r0'], '1': ['r1'] },
      r1: { '0': ['r2'], '1': ['r0'] },
      r2: { '0': ['r1'], '1': ['r2'] }
    }
  },

  {
    name:         'Starts with "ab"',
    desc:         'Strings over {a,b} that begin with the prefix ab',
    states:       ['s0', 's1', 's2', 's3'],
    alphabet:     ['a', 'b'],
    startState:   's0',
    acceptStates: ['s2'],
    transitions: {
      s0: { a: ['s1'] },
      s1: { b: ['s2'] },
      s2: { a: ['s2'], b: ['s2'] },
      s3: {}
    }
  }

];
