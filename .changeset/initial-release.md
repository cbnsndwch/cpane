---
'@cpane/cli': minor
---

Initial release: declarative tmux session profiles over SSH.

- `cpane <profile>` connects (or bootstraps) a tmux session from a YAML/JSON/JSONC/JSON5/TOML profile, non-destructively offering to fill in any windows/panes missing from an already-running session
- Bare `cpane` opens a fuzzy-search picker; `cpane add --wizard` builds a profile with no YAML required — both are OpenTUI terminal screens
- `cpane list`, `add`, `edit`, `sync` (capture a live session's structure back into its profile), `shell-init` (per-profile shell functions for bash/zsh/pwsh), `upgrade`, and `replicate-profiles`
- Self-contained binaries for windows-x64, linux-x64, and linux-arm64 via `bun build --compile` — no runtime prerequisite on the machine that runs `cpane`
- Isolated `cpane`/`cpanext` stable/rc channels with fully separate config directories
