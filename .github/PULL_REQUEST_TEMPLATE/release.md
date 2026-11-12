<!--
  PR title: chore(release): v<version>        e.g. chore(release): v1.4.0
  Post-release steps (deploy, monitoring, informing stakeholders) are tracked in the release issue.
-->

## Release v<!-- version number -->

## Release Issue
<!-- The [RELEASE] issue that tracks this release. -->
Refs #

## Scope
<!-- Brief description of what is included in this release. -->

## Included Changes
<!-- Paste the CHANGELOG section for this version, or link to it. -->
-

## Breaking Changes & Migration
<!-- What must users or other services change? Write "None" if not applicable. -->
None

## Checklist

### Preparation
- [ ] Version number updated (package.json / pyproject.toml / etc.)
- [ ] CHANGELOG updated
- [ ] All planned issues and PRs merged
- [ ] Dependencies reviewed; no known vulnerabilities (e.g. `pnpm audit`)

### Testing
- [ ] Unit tests passed
- [ ] Integration tests passed
- [ ] Manual smoke test completed on staging

### After Merge
- [ ] Tag `v...` created on the merge commit
- [ ] Release notes published on GitHub Releases
