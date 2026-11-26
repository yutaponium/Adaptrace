#!/bin/sh
# Creates the test repository for the adaptrace-minutes skill in <dir>:
# a git repository with the files in repo/, committed on 2026-11-26, and
# the skill copied into .claude/skills/.
set -eu
dest=${1:?usage: setup.sh <dir>}
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(CDPATH= cd -- "$here/../../.." && pwd)
if [ -e "$dest" ]; then
  echo "$dest already exists" >&2
  exit 1
fi
mkdir -p "$dest"
cp -R "$here/repo/." "$dest/"
cd "$dest"
# Not the maintainer's git templates or global ignore file.
git init -q --template=
git -c core.excludesFile=/dev/null add -f .
GIT_AUTHOR_DATE=2026-11-26T10:00:00+09:00 \
  GIT_COMMITTER_DATE=2026-11-26T10:00:00+09:00 \
  git -c user.name=test -c user.email=test@example.com \
    -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -q -m init
# The commit to compare with, even if the runner amends or adds commits.
git -c tag.gpgSign=false tag test-base
mkdir -p .claude/skills
cp -R "$root/skills/adaptrace-minutes" .claude/skills/
echo "created $dest"
