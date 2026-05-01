# NFA to DFA Visualizer

A web app that converts an NFA to a DFA using subset construction, draws both as graphs, and lets you simulate input strings. Built for ASU's CSC 355 (Theoretical Computer Science).

Live demo: https://ndipucci-stack.github.io/CSC355Project/

## Features

- Define states, alphabet (with ε), start state, accept states, and transitions.
- One-click NFA to DFA conversion with a step-by-step log.
- Side-by-side NFA and DFA graphs with draggable nodes.
- String simulator that steps through the input symbol by symbol.
- Preset example NFAs.
- Guided tutorial walkthrough.
- DFA minimization with Moore's algorithm.
- ASU email gate on the landing page.

## Running locally

Plain HTML, CSS, and JavaScript — no build step.

```
git clone https://github.com/ndipucci-stack/CSC355Project.git
cd CSC355Project
python3 -m http.server 8000
```

Then visit http://localhost:8000/.

## Tech stack

- Vanilla JavaScript
- D3.js v7
- Hosted on GitHub Pages

## Project layout

```
index.html              landing / sign-in page
app.html                main converter
style.css               styles
main.js                 UI, D3 rendering, simulator
automata/nfa.js         NFA model
automata/dfa.js         DFA model
automata/converter.js   subset construction
automata/minimizer.js   DFA minimization
examples/presets.js     example NFAs
tutorial/tutorial.js    walkthrough overlay
```

## Course

CSC 355, Arizona State University, Spring 2026.
