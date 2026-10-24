# Modeling Standard — agent operating contract

Keep `CLAUDE.md` and `AGENTS.md` identical. Start with the current work order and root `README.md`; consult only the relevant decisions and engineering records. Historical planning documents are evidence, not standing instructions.

## Partnership and product boundaries

- Cory and Dustin are equal partners. Cory has final authority over binding product vision and fundamental semantics; Dustin owns technical strategy, architecture, infrastructure, implementation, engineering delivery, and repository integration.
- Cory leads legal and compliance coordination, with Dustin's active support. Obtain qualified legal review when required; neither partner's preference substitutes for it.
- Dustin decides technology, SaaS versus custom build, architecture, development sequence, and reversible design details. Technical proposals from any partner or agent are not architectural mandates.
- Ratified direction and later explicit Cory rulings govern product semantics. Recommendations, historical plans, prototypes, and existing code do not ratify product decisions.
- Default to progress within an authorized assignment. Dustin may authorize provisional, private synthetic interfaces, fields, and workflows that are consistent with the vision. An `OPEN` decision alone is not a blocker.
- Escalate only material conflicts with binding direction, unresolved fundamental semantics, hard-to-reverse commitments, consequential commercial policy, or legal, consent, privacy, and real-use boundaries. Do not block independent synthetic work.
- Track A (collaboration and agreement engine) and Track B (professional toolkit) are workstreams of one product. Their current priority belongs in the README or work order. A demo never authorizes real use.

## Execution and verification

- Follow the current bounded work order: outcome, scope, relevant decisions, acceptance evidence, environment, permitted actions, and stop condition. Exercise engineering judgment; do not repeatedly request approval for routine or already-authorized actions.
- Prefer small changes, clear ownership, existing patterns, and proportionate tests. Do not build speculative systems or neighboring features.
- Enforce authorization, privacy, data integrity, and isolation. Label synthetic behavior accurately; do not expose private material or enable real participants without authorization.
- Inspect command side effects before running them. Here `npm run check` can generate migration files; `npm test` recreates a named test database; demo/browser tests can reset demo data. Separate Git worktrees do not isolate databases. Use a task-owned isolated environment for destructive checks.
- Report the actual commands, results, observed behavior, and unverified limitations. Never claim that passing tests proves untested real-world behavior.

## Repository, processes, and continuity

- Establish the assigned branch, worktree, base commit, working changes, and resource ownership before acting. Never share one worktree between independent implementation agents or overwrite unpublished work.
- Commit, push, PR, merge, deploy, and service permissions come from the current assignment, not this file; an authorization remains valid for that assignment until changed. Dustin controls integration. No destructive cleanup, reset, prune, or shared-history rewrite without explicit authority.
- On Asher, use the task-assigned builder, review, and demo sessions; `ms-builder`, `ms-review`, and `ms-demo` are the normal conventions, not a reason to rename or restart existing sessions. Preserve `opend` and unrelated infrastructure.
- Never stop processes by broad command or name matching (`pkill -f`, `killall`). Verify exact process/service ownership; stop only task-owned or expressly assigned resources.
- When work remains, update an existing work order or continuation record with verified state and the next action; do not create a new handoff file unless needed. For read-only assignments, hand off in the response.
- Write plain, work-focused commits and files without AI attribution, agent/session identifiers, or generated footers.
