# SOP: AI Agent Refactoring Workflow

## 1. Purpose

Guides AI agents through safe, structured code improvements. Ensures architectural changes align with domain language and maintain test coverage. Prevents breaking changes disguised as cleanup.

---

## 2. Scope

Use this SOP when:

- Consolidating tightly-coupled modules.
- Improving code architecture or readability.
- Updating legacy patterns to modern standards.

Do not use this SOP when:

- Adding net-new features (use `new-feature.md`).
- Fixing an isolated bug (use `bug-fix.md`).

---

## 3. Owner

**Process Owner:** AI Agent / Dev Lead
**Responsible Team:** Engineering

The owner is responsible for keeping this SOP accurate and improving it when the process changes.

---

## 4. Inputs

Required inputs:

- Refactoring target or goal (Markdown file in `docs/ai-workflows/context/`).
- Access to `CONTEXT.md` and existing test suite.

---

## 5. Tools and Systems

| Tool / System | Purpose | Access Required |
|---|---|---|
| OpenCode / Claude | AI Agent Execution | Yes |
| `improve-codebase-architecture` skill | Find and plan deepening | Yes |
| `to-issues` skill | Chunk the refactor | Yes |
| `tdd` skill | Safe, tested changes | Yes |

---

## 6. Procedure

### Step 1: Analyze Architecture

**Goal:**
Identify deepening opportunities informed by domain language.

**Actions:**

1. Agent reads refactor target context.
2. Agent invokes `improve-codebase-architecture` skill.
3. Agent analyzes `CONTEXT.md` and `docs/adr/`.
4. Agent proposes specific architectural improvements.

**Check before continuing:**

- [ ] Proposed changes align with recorded architecture decisions.

---

### Step 2: Create Execution Plan

**Goal:**
Break the large refactor into small, safe, mergeable steps.

**Actions:**

1. Agent invokes `to-issues` skill using Step 1 output.
2. Agent generates small issues. Each must leave the codebase in a working state.
3. Issues saved to tracker or designated folder.

**Check before continuing:**

- [ ] No single issue takes more than one session to complete.

---

### Step 3: Safe Refactoring

**Goal:**
Execute changes while keeping the test suite green.

**Actions:**

1. For each issue, agent invokes `tdd` skill.
2. Agent confirms existing tests pass (or writes missing tests first).
3. Agent refactors code.
4. Agent runs tests.
5. Agent commits issue chunk.

**Check before continuing:**

- [ ] Tests pass at every commit.

---

### Step 4: Update Documentation

**Goal:**
Improve and ensure all documentation is aligned to reflect implementation changes.

**Actions:**

1. For each issue, agent invokes `write-` skill.
2. Agent writes documentation.
3. Agent commits documentation issue.

**Check before continuing:**

- [ ] Tests pass at every commit.

---

## 7. Outputs

At the end of this process, the following should be true:

- Codebase architecture improved.
- Domain language matched.
- No tests broken.
- Changes committed in small logical chunks.

---

## 8. Definition of Done

This SOP is complete only when:

- [ ] Architecture analyzed.
- [ ] Refactor chunked into issues.
- [ ] All issues completed.
- [ ] Full test suite green.
- [ ] Commits pushed.

---

## 9. Quality Checks

Before marking this process as complete, verify:

- [ ] No behavioral changes (features still work exactly as before).
- [ ] Performance hasn't degraded.

---

## 10. Common Mistakes

| Mistake | Impact | How to Avoid |
|---|---|---|
| Changing behavior | Breaking users | Write tests before refactoring |
| Massive commits | Hard to review/revert | Chunk with `to-issues` |
| Ignoring ADRs | Reinventing the wheel | Read `docs/adr/` first |

---

## 11. FAQs

### What if I find a bug while refactoring?

Do not fix it in the refactor commit. Create a new bug issue and fix it separately using `bug-fix.md`.

---

## 12. Escalation

If something does not work or a decision is unclear, contact:

| Situation | Contact / Role | Expected Action |
|---|---|---|
| Ambiguous domain term | Dev Lead | Update `CONTEXT.md` |

---

## 13. Related Documents

- `CONTEXT.md`
- `docs/adr/`

---

## 14. Change Log

| Date | Version | Changed By | Change Summary |
|---|---:|---|---|
| 2026-05-17 | 1.0 | AI Agent | Initial version |