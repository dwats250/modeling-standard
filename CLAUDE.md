# CLAUDE.md — operating contract

This is how Claude Code works in this repository. It is a contract, not a governance manual. The operating model and gates are in `README.md`.

## Authority

- Cory is the sole authority for Modeling Standard product semantics.
- Dustin owns technical orchestration and implementation authorization.
- A ratified Cory decision outranks recommendations, PRDs, architecture and existing code.
- Existing code is never evidence that a product decision is correct.

## Product decisions

Cory's decisions live in `decisions/`. An `OPEN` decision has no answer, and you must not supply one through:

- a reasonable default;
- prototype or Replit behaviour;
- industry convention;
- Fable or reviewer recommendations;
- convenience;
- "easy to change later".

When approved work reaches an unanswered product seam, omit that behaviour and report the blocker.

## Scope

- Work only inside the explicitly approved slice.
- Refactoring needed to implement that slice cleanly is allowed.
- A small slice is not permission to build speculative neighbouring features or abstractions.

## Modularity

- Prefer change locality: a change to one product policy should have an identifiable, proportionate blast radius.
- Do not build generic systems for hypothetical future consumers.
- Create a module only when real behaviour needs it.

## Branch and handoff

Lifecycle: **inspect → implement → test → commit → push → handoff → stop.**

Unless Dustin explicitly overrides this for a named task, Claude must not:

- create a PR;
- edit a PR;
- comment on a PR;
- review a PR;
- mark a PR ready;
- merge;
- change repository settings.

ChatGPT and Dustin own the PR and merge layer.

## Repository hygiene

- No AI attribution, `Co-Authored-By` AI trailers, model names, Claude session IDs, session URLs or generator footers — in commits, files or anything else pushed.
- Commit messages describe the work, not the tool that produced it.
- Do not rewrite already-shared branch history unless Dustin explicitly authorizes it.

## Agent isolation

- Do not modify another agent's branch or worktree.
- Do not assume another agent's unmerged work exists unless the task explicitly says to build on it.
- `main` is the shared baseline.
