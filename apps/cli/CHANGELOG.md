# @cpane/cli

## 0.3.0

### Minor Changes

- 197ba16: Add `cpane schema` (alias `sc`), which writes a JSON Schema for profile files to your config dir — point your editor's JSON/YAML language server at it for autocomplete and structural validation while hand-editing profiles.

## 0.2.0

### Minor Changes

- 8290107: Add short aliases for every subcommand: `l`/`ls` for `list`, `a` for `add`, `e` for `edit`, `s` for `sync`, `i` for `shell-init`, `u` for `upgrade`, `r` for `replicate-profiles`.

## 0.1.0

### Minor Changes

- 6800aa0: Initial release: declarative tmux session profiles over SSH.

  - `cpane <profile>` connects (or bootstraps) a tmux session from a YAML/JSON/JSONC/JSON5/TOML profile, non-destructively offering to fill in any windows/panes missing from an already-running session
  - Bare `cpane` opens a fuzzy-search picker; `cpane add --wizard` builds a profile with no YAML required — both are OpenTUI terminal screens
  - `cpane list`, `add`, `edit`, `sync` (capture a live session's structure back into its profile), `shell-init` (per-profile shell functions for bash/zsh/pwsh), `upgrade`, and `replicate-profiles`
  - Self-contained binaries for windows-x64, linux-x64, and linux-arm64 via `bun build --compile` — no runtime prerequisite on the machine that runs `cpane`
  - Isolated `cpane`/`cpanext` stable/rc channels with fully separate config directories
