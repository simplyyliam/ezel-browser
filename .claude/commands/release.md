---
description: Prepare an Ezel release (checks, version bump, changelog, annotated tag). Never pushes.
argument-hint: '[notes, e.g. "known issue: …"]'
---

Prepare the next Ezel release on `main`. You prepare it locally; the user tests it and publishes it with `npm run release`. Never push, never run `npm run release`, never launch the app.

Notes from the user (may be empty): $ARGUMENTS
Use them in the changelog (a "known issue: …" goes under Known issues, anything else where it fits). If a note asks for something other than changelog content, do it only if it fits the steps below; otherwise ask.

Stop and report at the first step that fails. Don't fix code as part of a release.

## 1. Check main

- On `main`, with a clean working tree (`git status --porcelain` empty, untracked files included). Otherwise stop.
- Run every check and stop if any fails:
  - in `src-tauri/`: `cargo check`, `cargo clippy --all-targets`, `cargo test`
  - in the root: `npx tsc -b`, `npx vite build`, `npm run lint`
- Clippy or lint warnings don't fail the build: list them and ask whether to go on.
- `cargo test` regenerates `src/shared/bindings.ts`. If any check leaves the tree dirty, stop: the bindings were out of date and need their own commit first.

## 2. Pick the version

- Last release: `git describe --tags --abbrev=0 --match 'v*'`. Changes: `git log --oneline <last tag>..HEAD` (read the bodies too, and merges' branches). No commits since the tag: stop, there's nothing to release.
- While Ezel is 0.x: **minor** (0.2.0 → 0.3.0) if anything adds a feature or changes behaviour the user can notice; **patch** (0.2.0 → 0.2.1) if it only fixes bugs. Only docs, chores or refactors: ask whether to release at all.
- Say which version and why, naming the commits that decided it.
- If the tag `vX.Y.Z` already exists (locally or on origin, `git ls-remote --tags origin`), stop.

## 3. Bump the version

- `src-tauri/tauri.conf.json` (`version`), `src-tauri/Cargo.toml` (`[package] version`), and `npm version X.Y.Z --no-git-tag-version` for `package.json` and `package-lock.json`.
- Run `cargo check` in `src-tauri/` again so `Cargo.lock` picks up the new version.
- Commit those five files: `chore(release): vX.Y.Z`.
- Already at X.Y.Z (a release prepared again after a fix): skip this step.

## 4. Changelog

Add a section at the top of `CHANGELOG.md` (below the intro), in the style of the sections already there:

```
## [X.Y.Z] - YYYY-MM-DD

One plain sentence: what this release is about.

### Added
### Changed
### Fixed
### Known issues
### Privacy
```

- Today's date. Leave out Added, Changed or Fixed when there's nothing for them.
- Plain language for people who use Ezel, not for developers: what they'll notice, in Ezel's voice. No file names, function names, commit hashes or jargon. Bold the lead of the big items, as in earlier sections.
- **Known issues** (at most 8): start from the previous release's list. Drop the ones this release fixes, update the ones that changed, add new ones and the user's notes. Over 8: merge related ones or keep the ones that matter most. While the installer isn't code-signed, always keep the SmartScreen item ("More info", then "Run anyway"): the release notes only explain it there.
- **Privacy**: what Ezel sends to whom (Google, Microsoft, …). Carry over what's still true and add anything new.
- The GitHub release body is this section, so it must read well on its own.
- Commit: `docs: add changelog for vX.Y.Z`. If the section already exists (prepared again after a fix), update it instead and commit `docs: update changelog for vX.Y.Z`.

## 5. Tag

- Annotated, on that commit: `git tag -a vX.Y.Z -m "Ezel X.Y.Z: <the section's sentence, shortened>"`.
- Never push the commits or the tag.

## 6. Finish

Show the version, the changelog section and `git log --oneline <last tag>..HEAD`, then tell the user:

1. **Test the app** from this commit.
2. **Run `npm run release`**: it checks main and the tag again, shows what goes out, asks before pushing main and the tag, and the tag starts the GitHub Action that builds the installers.
3. **Publish the draft** on GitHub's Releases page once the Action is done and the installers work.

If something needs fixing before it's pushed: `git tag -d vX.Y.Z`, fix it on main, and run /release again.
