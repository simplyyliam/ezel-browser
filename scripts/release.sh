#!/usr/bin/env bash
# Publishes a release that /release prepared: pushes main, then its v* tag.
# The tag starts .github/workflows/release.yml, which drafts the GitHub Release.
# Run from Git Bash (or `npm run release`). Never force pushes, never pushes other tags.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

fail() {
  echo "release: $*" >&2
  exit 1
}

# main, clean, and not behind origin.
branch=$(git symbolic-ref --quiet --short HEAD || true)
[ "$branch" = "main" ] || fail "switch to main first (on ${branch:-a detached HEAD})."
[ -z "$(git status --porcelain)" ] || fail "the working tree isn't clean. Commit or stash first."

echo "Fetching origin..."
git fetch --quiet origin
git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null || fail "origin/main doesn't exist."
behind=$(git rev-list --count main..origin/main)
[ "$behind" -eq 0 ] || fail "origin/main has $behind commit(s) main doesn't. Pull and run /release again."

# Exactly one v* tag on HEAD, annotated.
tags=$(git tag --points-at HEAD --list 'v*')
count=$(printf '%s' "$tags" | grep -c . || true)
[ "$count" -ne 0 ] || fail "HEAD has no v* tag. Run /release first."
[ "$count" -eq 1 ] || fail "HEAD has $count v* tags (${tags//$'\n'/, }), it needs exactly one. Run /release first."
tag=$tags
[ "$(git cat-file -t "$tag")" = "tag" ] || fail "$tag is a lightweight tag. /release creates an annotated one."
if [ -n "$(git ls-remote --tags origin "refs/tags/$tag")" ]; then
  fail "$tag is already on origin."
fi

# The tag's version must be the app's version everywhere.
version=${tag#v}
tauri_version=$(node -p "require('./src-tauri/tauri.conf.json').version")
package_version=$(node -p "require('./package.json').version")
cargo_version=$(sed -n '/^\[package\]/,/^\[/{s/^version *= *"\(.*\)"/\1/p}' src-tauri/Cargo.toml | head -n 1)
mismatch=""
[ "$tauri_version" = "$version" ] || mismatch+=$'\n'"  src-tauri/tauri.conf.json: $tauri_version"
[ "$cargo_version" = "$version" ] || mismatch+=$'\n'"  src-tauri/Cargo.toml: $cargo_version"
[ "$package_version" = "$version" ] || mismatch+=$'\n'"  package.json: $package_version"
[ -z "$mismatch" ] || fail "$tag doesn't match the app version:$mismatch"

# What's going out.
previous=$(git describe --tags --abbrev=0 --match 'v*' "$tag^" 2>/dev/null || true)
echo
echo "Tag: $tag"
echo
git for-each-ref "refs/tags/$tag" --format='%(contents)' | sed 's/^/  /'
if [ -n "$previous" ]; then
  echo "Commits since $previous:"
  git log --oneline --no-decorate "$previous..$tag" | sed 's/^/  /'
else
  echo "Commits (no earlier v* tag):"
  git log --oneline --no-decorate "$tag" | sed 's/^/  /'
fi
echo

read -r -p "Publish $tag? (y/n) " answer
case "$answer" in
  y | Y) ;;
  *) echo "Nothing pushed."; exit 0 ;;
esac

# --no-follow-tags overrides push.followTags, which would carry other local tags along.
git push --no-follow-tags origin refs/heads/main:refs/heads/main
git push --no-follow-tags origin "refs/tags/$tag:refs/tags/$tag"

# https://github.com/<owner>/<repo> from an SSH or HTTPS origin URL.
remote=$(git remote get-url origin)
remote=${remote%.git}
case "$remote" in
  *://*) path=${remote#*://}; host=${path%%/*}; repo_path=${path#*/} ;;
  *) host=${remote%%:*}; repo_path=${remote#*:} ;;
esac
host=${host#*@}
host=${host%%:*}
repo_url="https://$host/$repo_path"

echo
echo "Pushed $tag. The release workflow is building the installers:"
echo "  Actions:  $repo_url/actions"
echo "  Releases: $repo_url/releases"
echo "When it's done, test the draft's installers, then publish the draft."
