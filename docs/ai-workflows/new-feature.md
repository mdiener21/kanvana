# SOP: AI Agent New Feature Workflow

## 1. Purpose

Guides AI agents through structured, repeatable feature creation. Ensures alignment with domain models, formal requirements, issue tracking, and test-driven implementation. Prevents "cowboy coding" and drift from project architecture.

---

## 2. Scope

Use this SOP when:

- Starting a new feature from a rough idea.
- Building a multi-step enhancement.

Do not use this SOP when:

- Fixing a bug (use `bug-fix.md`).
- Refactoring existing code (use `refactor.md`).

---

## 3. Owner

**Process Owner:** AI Agent / Dev Lead
**Responsible Team:** Engineering

The owner is responsible for keeping this SOP accurate and improving it when the process changes.

---

## 4. Inputs

Required inputs:

- Feature idea draft (Markdown file in `docs/ai-workflows/context/`).
- Access to project documentation (`CONTEXT.md`, `docs/adr/`).

---

## 5. Tools and Systems

| Tool / System | Purpose | Access Required |
|---|---|---|
| OpenCode / Claude | AI Agent Execution | Yes |
| `grill-with-docs` skill | Stress-test idea against domain | Yes |
| `to-prd` skill | Generate formal requirements | Yes |
| `to-issues` skill | Create execution plan | Yes |
| `tdd` skill | Test-driven implementation | Yes |

---

## 6. Procedure

### Step 1: Stress-Test Idea

**Goal:**
Align feature idea with existing domain model and architecture.

**Actions:**

1. Agent reads feature idea context file.
2. Agent invokes `grill-with-docs` skill.
3. User and agent iterate until shared understanding is reached.

**Check before continuing:**

- [ ] Domain terminology is sharp.
- [ ] Edge cases explored.

---

### Step 2: Generate PRD

**Goal:**
Formalize the feature requirements into a Product Requirements Document.

**Actions:**

1. Agent invokes `to-prd` skill.
2. Agent generates PRD based on Step 1 output.
3. PRD is published to the project issue tracker or saved as Markdown.

**Check before continuing:**

- [ ] PRD captures all requirements and constraints.

---

### Step 3: Create Execution Plan

**Goal:**
Break down the PRD into independently grabbable issues.

**Actions:**

1. Agent invokes `to-issues` skill using PRD as input.
2. Agent generates vertical slice issues.
3. Issues are saved to project tracker or a designated folder.

**Check before continuing:**

- [ ] Work is divided into small, testable chunks.

---

### Step 4: Test-Driven Implementation

**Goal:**
Implement each issue using a red-green-refactor loop.

**Actions:**

1. For each issue, agent invokes `tdd` skill.
2. Agent writes failing test.
3. Agent writes code to pass test.
4. Agent refactors.
5. Agent commits and pushes work.

**Check before continuing:**

- [ ] All tests pass.
- [ ] Code committed per issue.

---

## 7. Outputs

At the end of this process, the following should be true:

- Feature is fully implemented.
- Feature is backed by PRD and issue tickets.
- Feature has complete test coverage.
- Code is committed and pushed.

---

## 8. Definition of Done

This SOP is complete only when:

- [ ] PRD generated.
- [ ] Issues created.
- [ ] All issues implemented via TDD.
- [ ] All tests passing.
- [ ] Code pushed to remote.

---

## 9. Quality Checks

Before marking this process as complete, verify:

- [ ] No required fields are missing in PRD.
- [ ] Implementation matches PRD constraints.
- [ ] `git status` shows clean working tree.

---

## 10. Common Mistakes

| Mistake | Impact | How to Avoid |
|---|---|---|
| Skipping `grill-with-docs` | Architecture drift, wrong abstractions | Always invoke skill first |
| Giant single commits | Hard to review, revert | Commit after each issue |
| Writing code before tests | Missing coverage, brittle code | Follow `tdd` red-green loop strict |

---

## 11. FAQs

### What if the feature idea changes mid-implementation?

Halt implementation. Re-run `grill-with-docs` and update PRD/Issues before resuming.

---

## 12. Escalation

If something does not work or a decision is unclear, contact:

| Situation | Contact / Role | Expected Action |
|---|---|---|
| Domain conflict | Dev Lead | Clarify `CONTEXT.md` |
| Test suite failure | Dev Lead | Review test setup |

---

## 13. Related Documents

- `CONTEXT.md`
- `docs/adr/`

---

## 14. Change Log

| Date | Version | Changed By | Change Summary |
|---|---:|---|---|
| 2026-05-17 | 1.0 | AI Agent | Initial version |