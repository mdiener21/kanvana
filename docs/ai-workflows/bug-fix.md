# SOP: AI Agent Bug Fix Workflow

## 1. Purpose

Guides AI agents through structured, repeatable bug resolution. Prioritizes evidence over assumptions. Ensures fixes are proven by tests and verified before completion claims. Prevents regression and whack-a-mole debugging.

---

## 2. Scope

Use this SOP when:

- Diagnosing and fixing a reported bug.
- Fixing failing tests in existing features.

Do not use this SOP when:

- Building a new feature (use `new-feature.md`).
- Broad architectural refactoring (use `refactor.md`).

---

## 3. Owner

**Process Owner:** AI Agent / Dev Lead
**Responsible Team:** Engineering

The owner is responsible for keeping this SOP accurate and improving it when the process changes.

---

## 4. Inputs

Required inputs:

- Bug report / Reproduction steps (Markdown file in `docs/ai-workflows/context/`).
- Access to failing tests or logs.

---

## 5. Tools and Systems

| Tool / System | Purpose | Access Required |
|---|---|---|
| OpenCode / Claude | AI Agent Execution | Yes |
| `systematic-debugging` skill | Evidence-based diagnosis | Yes |
| `tdd` skill | Test-driven fix | Yes |
| `verification-before-completion` skill | Prove the fix works | Yes |

---

## 6. Procedure

### Step 1: Systematic Diagnosis

**Goal:**
Gather evidence and isolate the exact root cause before proposing fixes.

**Actions:**

1. Agent reads bug report context file.
2. Agent invokes `systematic-debugging` skill.
3. Agent uses bash/grep to find logs, traces, or reproduce the error locally.
4. Agent writes down the proven root cause.

**Check before continuing:**

- [ ] Root cause is proven by log or reproduction, not guessed.

---

### Step 2: Implement Fix with TDD

**Goal:**
Write the fix without breaking others.

**Actions:**

1. Agent invokes `tdd` skill
2. Agent runs the specific test to confirm green.
3. Agent runs the full test suite to check for regressions.

**Check before continuing:**

- [ ] Specific test passes.
- [ ] Full test suite passes.

---

### Step 4: Verify and Complete

**Goal:**
Prove the work is done before claiming success.

**Actions:**

1. Agent invokes `verification-before-completion` skill.
2. Agent runs linter, type-checker, and tests.
3. Agent commits the fix with a descriptive message referencing the bug.

**Check before continuing:**

- [ ] Verification commands run and output confirmed.

---

## 7. Outputs

At the end of this process, the following should be true:

- Root cause identified and documented.
- Regression test added and passing.
- Bug fixed.
- Code committed.

---

## 8. Definition of Done

This SOP is complete only when:

- [ ] Root cause isolated.
- [ ] Failing test written.
- [ ] Fix implemented.
- [ ] All tests passing.
- [ ] Verification completed.
- [ ] Code committed.

---

## 9. Quality Checks

Before marking this process as complete, verify:

- [ ] No regressions introduced.
- [ ] Commit message explains *why* the fix works.

---

## 10. Common Mistakes

| Mistake | Impact | How to Avoid |
|---|---|---|
| Guessing fix without logs | Wasted time, wrong fix | Use `systematic-debugging` first |
| Fixing without a test | Bug returns later | Write failing test first |
| Claiming done without proof | Broken build | Use `verification-before-completion` |

---

## 11. FAQs

### What if I cannot reproduce the bug?

Stop. Request more information from the user or add extensive logging to the affected area and deploy. Do not guess a fix.

---

## 12. Escalation

If something does not work or a decision is unclear, contact:

| Situation | Contact / Role | Expected Action |
|---|---|---|
| Cannot reproduce | Bug Reporter | Provide better repro steps |

---

## 13. Related Documents

- `docs/ai-workflows/context/bug-template.md`

---

## 14. Change Log

| Date | Version | Changed By | Change Summary |
|---|---:|---|---|
| 2026-05-17 | 1.0 | AI Agent | Initial version |