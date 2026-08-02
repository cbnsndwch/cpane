# Changesets

Add a changeset for every change worth mentioning in the changelog:

```sh
pnpm changeset
```

Merged changesets accumulate into a "Version Packages" PR (opened/updated
automatically on push to `main`) that bumps `apps/cli/package.json` and
writes `CHANGELOG.md`. Merging that PR does **not** publish anything —
pushing the `vX.Y.Z` / `vX.Y.Z-rc.N` tag that triggers a real release build
is a separate, deliberate step. See `docs/PRD.md` §7/§8 for the full release
pipeline.

Read the [full changesets documentation](https://github.com/changesets/changesets)
for details.
