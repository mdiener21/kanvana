# Domain Docs

How engineering skills should consume this repo's domain documentation.

## Before exploring, read these

1. **`CONTEXT.md`** at the repo root — domain model, entity schemas, key workflows, architecture
   boundaries, and storage/sync layer. Read this first before working on any feature.
   It is hand-maintained (not generated); update it when schemas or workflows change.
2. **`docs/adr/`** — Architecture Decision Records. Currently:
   - `0001-two-log-audit-trail.md` — why the audit trail is split into task-embedded + board-scoped logs.
   Read any ADR that touches the area you're about to change before proposing structural edits.

If either doesn't exist, proceed silently. Don't flag their absence; don't suggest creating them
upfront — `/grill-with-docs` creates them lazily when terms or decisions are resolved.

## File Structure

This is a **single-context** repo:

```
/
├── CONTEXT.md           ← one domain context for the whole codebase
├── docs/
│   └── adr/             ← all architectural decisions
│       └── 0001-two-log-audit-trail.md
└── client/src/          ← source code
```

## Use the Glossary's Vocabulary

When naming concepts in issue titles, refactor proposals, hypotheses, or test names, use the
terms as defined in `CONTEXT.md`. Don't drift to synonyms the glossary avoids.

If the concept you need isn't in the glossary yet, either you're inventing language the project
doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR Conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (two-log audit trail) — but worth reopening because…_
