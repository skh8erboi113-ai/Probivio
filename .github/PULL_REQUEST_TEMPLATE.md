## Summary

<!-- What does this PR do in one sentence? -->

## Change type

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Documentation
- [ ] Performance
- [ ] Security
- [ ] Chore / dependency update

## Details

<!-- Explain the change. Link related issues. -->

Closes #

## Testing

- [ ] Unit tests added / updated
- [ ] Integration tests added / updated
- [ ] Manual E2E tested locally
- [ ] Load test run (if perf-sensitive)

## Breaking changes

- [ ] None
- [ ] Yes — see below

<!-- If yes, describe migration path -->

## Checklist

- [ ] Coverage ≥ 80% for changed files
- [ ] Zero new ESLint warnings
- [ ] `pnpm type-check` passes
- [ ] `pnpm format:check` passes
- [ ] Firestore rules updated if schema changed
- [ ] `docs/` updated for public API changes
- [ ] `.env.example` updated for new env vars
- [ ] No hardcoded secrets (verified locally)
- [ ] No `console.log` left in code
- [ ] Correlation IDs preserved through async boundaries
- [ ] Error messages don't leak PII or stack traces
- [ ] All new services wrapped in circuit breakers if calling external APIs
- [ ] All new endpoints validated with Zod

## Screenshots / recordings

<!-- If UI change -->

## Deployment notes

<!-- Anything special about deploying this? Migration required? Feature flag? -->
