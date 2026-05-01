# NFA → DFA Visualizer

An interactive web app that converts a Nondeterministic Finite Automaton
(NFA) into its equivalent Deterministic Finite Automaton (DFA) using the
subset construction algorithm, renders both machines as live D3 graphs,
and lets you simulate input strings on either one. Built for Arizona
State University's CSC 355 (Theoretical Computer Science).

**Live demo:** https://ndipucci-stack.github.io/CSC355Project/

## Features

- **NFA builder** — define states, alphabet (including ε), start state,
  accepting states, and transitions through a guided input panel.
- **Subset construction** — one-click conversion from NFA to DFA with a
  step-by-step log showing each subset discovered and every ε-closure
  computed.
- **Live D3 graphs** — NFA and DFA rendered side by side, with draggable
  nodes, color-coded start / accepting / dead states, and curved edges
  for multi-symbol transitions.
- **String simulator** — type an input and step through the trace symbol
  by symbol; an accept / reject banner confirms the final state.
- **Presets** — one-click load of classic example NFAs for quick
  exploration.
- **Guided tutorial** — a built-in walkthrough that spotlights each
  panel and pairs a short UI orientation with a plain-English theory
  refresher on NFAs, DFAs, ε-closure, and subset construction.
- **DFA minimization** — one-click Moore's algorithm to collapse the
  DFA into its minimal equivalent, with merge steps appended to the
  step log.
- **ASU email gate** — a landing page that accepts `@asu.edu` addresses
  before entering the app.

## Running locally

The app is pure HTML, CSS, and vanilla JavaScript — no build step,
no package manager. Clone the repo and serve it over HTTP.

```
git clone https://github.com/ndipucci-stack/CSC355Project.git
cd CSC355Project
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`. Alternatively, open the folder in
VS Code and launch it with the Live Server extension.

## Tech stack

- Vanilla JavaScript (no framework)
- D3.js v7 for graph rendering
- Google Fonts (Syne, IBM Plex Mono)
- Hosted on GitHub Pages

## Project layout

```
index.html          landing / sign-in page
app.html            main converter
style.css           shared styles for the converter
main.js             UI wiring, D3 rendering, string simulator
automata/
  nfa.js            NFA data model
  dfa.js            DFA data model
  converter.js      subset-construction algorithm
  minimizer.js      DFA minimization (Moore's algorithm)
examples/presets.js sample NFAs for the Load Preset menu
tutorial/tutorial.js guided walkthrough overlay
```

## Course context

Developed for CSC 355 at Arizona State University, Spring 2026.
