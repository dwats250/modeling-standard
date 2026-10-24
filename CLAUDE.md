# CLAUDE.md — Modeling Standard operating contract

Keep this file short. Read `README.md` for product state and gates, `decisions/` for ratified decisions, and the current work order for task-specific authority.

## Partnership and decisions

- Cory and Dustin are equal partners. Cory has final authority over binding product vision and semantics; Dustin owns technical strategy, architecture, implementation, delivery, repository control, and engineering authorization.
- Cory leads coordination of legal/compliance work and qualified legal review; Dustin supports that work and owns technical implementation. Neither partner substitutes for legal counsel.
- Dustin chooses architecture, infrastructure, SaaS/build tradeoffs, engineering practices, development sequence, and reversible implementation details. Product suggestions are not technical mandates.
- Default to progress within an authorized scope. Dustin may approve provisional synthetic UI, fields, workflows, and features consistent with the product vision without separate Cory sign-off.
- `OPEN` decisions remain unresolved: a prototype is not ratification. Escalate genuine conflicts with ratified direction, fundamental product semantics, irreversible commitments, consequential commercial policy, or legal/consent/privacy/real-use boundaries. Do not block unrelated synthetic work.
- Track A (collaboration/agreement engine) and Track B (professional toolkit) may advance independently. Track B is currently the priority; neither track is authorized for real use merely because a demo works.

## Scope and engineering

- Follow the bounded work order: inspect, implement, test, report, and stop at its stated boundary. Make reasonable reversible choices without requesting approval for routine details.
- Prefer small, coherent changes and existing patterns. No speculative abstractions, broad refactors, or neighboring features without demonstrated need.
- Protect authorization, isolation, privacy, and data integrity. Never treat synthetic accounts, fixture media, or staging as permission for public exposure or real participants.
- Validate changes with relevant tests and checks; report unverified claims and remaining limitations honestly.

## Git and agent isolation

- One canonical active Claude implementation tmux session: `ms-builder`. `ms-review` is for independent review; `ms-demo` is for demo services. Tracks are scopes, not standing tmux sessions.
- Each implementation assignment identifies its branch, worktree, base commit, owner, scope, acceptance criteria, and stop condition. Never run two implementation agents in one worktree.
- `main` is the shared baseline. Preserve unpublished changes and other agents' branches/worktrees; do not reset, clean, prune, or rewrite shared history without explicit authorization.
- Commits, pushes, PR changes, merges, deployments, and service changes require the permissions stated in the current work order. Never infer permission from a standing lifecycle rule. Dustin controls integration and merges.
- Commit messages describe the work, without AI attribution, model names, session IDs, or generator footers.

## Processes and handoffs

- Preserve `opend` and unrelated infrastructure. Never use broad process kills (`pkill -f`, `killall`, etc.). Verify process ownership before stopping an exact service, tmux session, or task-owned PID.
- Do not restart or reconfigure unrelated services for convenience. Clean up only resources created or explicitly assigned to the current task.
- Before ending an active task, leave a concise durable handoff in the project's designated tracked location when needed. Do not rely on tmux scrollback or chat history as the sole record.
