---
name: issue-repro-fix
description: Fix a reported bug with a disciplined reproduce-then-fix loop. Use this skill whenever the user reports a bug, pastes an issue, or asks to reproduce/fix a defect — even if they only say "X is broken" or "write a test for this bug." It creates an E2E repro test asserting correct behavior, fixes only the causing code, and loops until green.
---

# Issue → E2E Repro → Minimal Fix

Loop: **RED** (new test fails on the bug) → **GREEN** (same test passes) → **TRIAGE** (still red: test-wrong vs fix-wrong). Never skip RED — an unvalidated repro advertises coverage it lacks.

## 0. Triage (5 min)

Extract before touching code: (1) observed vs expected, one sentence each — if expected is vague, ask; (2) minimal user-visible repro steps; (3) suspect files/symbols via search, not guesses.

## 1. Branch

```bash
git status --short   # must be empty first
git checkout main && git pull
git checkout -b fix/<issue>-<short-slug>
```

One issue per branch, never commit to `main`. Small branch = cheap rollback.

## 2. Repro E2E (assert correct, not broken)

Write ONE test encoding the issue's **correct behavior**, so it fails pre-fix and guards post-fix. Copy the nearest `e2e/*.e2e.mjs` as template (run: `for f in e2e/*.e2e.mjs; do node "$f" || exit 1; done`).

Checklist: isolated setup; seeded inputs (state/cards/RNG); shortest user-visible sequence; role/`data-testid` locators; auto-waiting assertions, no fixed sleeps; assert zero console/page errors. Seed via `window.__setCaravanState(s)`; assert behavior (badges, turns, cards), not store shapes.

RED validation (required): run it, confirm it fails **for the right reason** — the failure names the expected behavior and the trace shows the buggy app behavior, not a selector/setup crash. Passes pre-fix → assume the test is wrong (weak, wrong path), rework until genuinely RED. True NOT-REPRODUCIBLE exit only after sampling the transient window (e.g. 300/600/1500/2500ms — a 1s stale highlight IS the bug): leave source untouched, report steps tried.

## 3. Minimal fix

Change only the causing code: ~100 lines ideal, one logical change per `fix(<scope>):` commit with `Refs: #<issue>`. No refactors, renames, style, deps, or unrelated files. Small diffs stay reviewable and revertable.

## 4. GREEN validation

Re-run repro → pass; re-run 2–3× to rule out flakes; run neighboring e2e + unit suites for touched modules; sanity-check one held-out variation (different data, same path) so the fix generalizes.

## 5. Still-red triage

Isolate before editing either side: `git stash push -m "fix attempt"`, re-run repro on clean HEAD, `git stash pop`.

- Fails on clean HEAD contradicting the spec → **test-wrong**: fix test to match spec; verdict test-wrong → delete branch, log the lesson in issue notes, restart carrying context.
- Passes clean but fails with fix, or fails as described yet resists fix → **fix-wrong**: keep branch + test, re-diagnose from output, loop §3→§4. Log hypothesis → change → result each round; after ~3 rounds re-triage (§0).

## Done

Repro RED-then-GREEN (witnessed, re-run) + minimal `fix(<scope>):` diff + neighboring suites green + `Fixes #<issue>` ready.
