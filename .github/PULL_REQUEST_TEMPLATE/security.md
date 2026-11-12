<!--
  PR title: fix(<scope>): <description>        e.g. fix(auth): enforce rate limit on login endpoint
  Describe WHAT is fixed, not HOW it can be exploited. The title and commits stay visible forever.

  ⚠️ Critical vulnerability? Do NOT open a regular PR before the fix is deployed.
     Approach someone in person first. For public repositories, use a GitHub Security Advisory
     with a temporary private fork to work on the fix privately.
-->

## Summary
<!-- Neutral description of the fix. No exploit steps or proof-of-concept code. -->

## Related Issue / Advisory
Closes #

## Severity
- [ ] Low
- [ ] Medium
- [ ] High

<!-- OWASP category, CWE or CVE, if known. -->
**Category:**

## Fix
<!-- What was changed to close the issue? -->
-

## Verification
<!-- How was it confirmed that the issue is fixed? Describe the test, not the attack. -->

## Deployment Notes
- [ ] Secrets or credentials must be rotated
- [ ] Sessions or tokens must be invalidated
- [ ] Caches must be purged
- [ ] None of the above

## Checklist
- [ ] PR title and commits follow Conventional Commits and contain no exploit details
- [ ] I reviewed my own diff
- [ ] A test covers the vulnerability and passes with this fix
- [ ] Lint, type-check, tests and build pass locally
- [ ] No secrets in the diff or in the git history of this branch
- [ ] Dependencies checked for known vulnerabilities (e.g. `pnpm audit`)
