# cPane

`cpane` is a personal, cross-platform CLI that replaces a growing set of ad
hoc PowerShell functions for launching and attaching to `tmux` sessions on
remote hosts. Instead of one hand-written PowerShell function per host, you
define declarative **profiles** — named sessions with full
multi-window/multi-pane `tmux` layouts — and connect with a single short
command.

See [`docs/PRD.md`](docs/PRD.md) for the full product spec and rationale.

## Quick start

```sh
cpane add app        # scaffold a profile, opens it in $EDITOR
cpane app            # connect — creates the session if needed, attaches either way
```

Or skip the file entirely:

```sh
cpane add --wizard   # guided flow: pick host, name it, add windows/panes
```

## Profiles

A profile is a durable named session — the profile name *is* the tmux
session name. Each profile is one file in `~/.config/cpane/profiles/`
(YAML, JSON, JSONC, JSON5, or TOML — auto-detected by extension; `add`
writes YAML).

```yaml
# ~/.config/cpane/profiles/app.yaml
host: app-vm # a Host alias in ~/.ssh/config — never a hostname/user/port directly
windows:
  - name: app
    cwd: ~/app
    command: npm run dev # optional; omit to just land in a shell
  - name: logs
    cwd: ~/app/logs
    panes:
      - command: tail -f app.log
        split: horizontal # horizontal | vertical, relative to the prior pane
      - cwd: ~/app
        command: htop
        split: vertical
        size: 30% # optional; omit for tmux's default even split
  - name: scratch
    cwd: ~/app
```

A window is either `command` (single pane) or `panes` (a split layout) —
never both. Every pane must declare `split`, even the first one in a window
(there's nothing before it to split from, but the field is part of the
schema either way).

## Commands

| Command | What it does |
| --- | --- |
| `cpane <profile>` | Connect — no verb needed, same reasoning as `ssh <host>` |
| `cpane` | Fuzzy-search picker over all profiles |
| `cpane list` | Static, instant list of profile names |
| `cpane add <name>` | Scaffold a profile, then open it in `$EDITOR`/`$VISUAL` |
| `cpane add --wizard` | Guided flow to build a profile — no YAML required |
| `cpane edit <name>` | Open an existing profile in `$EDITOR`/`$VISUAL` |
| `cpane sync <profile>` | Capture a live session's structure back into its profile file |
| `cpane shell-init <bash\|zsh\|pwsh>` | Emit one shell function per profile, for eval'ing from your shell rc |
| `cpane upgrade` | Upgrade to the latest release on this binary's channel |
| `cpane replicate-profiles` | Copy `cpane`'s profiles into `cpanext` for rc testing |

### Per-profile shortcuts (`shell-init`)

To get back the old `profile.ps1` feel — typing `app` instead of `cpane app`
— add this to your shell startup file. It defines one function per profile,
each delegating to `cpane`, and picks up new/removed profiles the next time
you open a shell:

```sh
# ~/.bashrc / ~/.zshrc
eval "$(cpane shell-init bash)"   # or: zsh
```

```powershell
# $PROFILE
cpane shell-init pwsh | Out-String | Invoke-Expression
```

**Attach semantics:** if the session already exists remotely, cPane attaches
as-is and never destructively modifies it. It diffs the live session against
the profile and, if the profile declares windows/panes that aren't running,
*offers* to launch just the missing ones — existing windows/panes not
described in the profile are always left alone. If the session doesn't
exist yet, it's built from the profile, then attached.

**`sync` captures structure only** — window/pane names, cwds, and split
layout/sizing — never "what's currently running" in a pane. tmux can only
report a pane's foreground process, not the full command that started it,
so auto-capturing that would risk silently baking a one-off command in as a
permanent startup command.

## Channels

Two channels ship as two separate binaries, never a config toggle:

| Channel | Binary | Config dir |
| --- | --- | --- |
| Stable | `cpane` | `~/.config/cpane/` |
| RC / canary | `cpanext` | `~/.config/cpanext/` |

Both can be installed side by side; their config directories are fully
isolated, so an in-progress schema change on rc can never corrupt the
stable install. `cpane replicate-profiles` merge-copies stable profiles into
the rc config for testing (stable wins on name collisions; rc-only test
profiles are left alone).

## Development

Prerequisites: [Bun](https://bun.sh) ≥ 1.2, [pnpm](https://pnpm.io) ≥ 11.

```sh
pnpm install
pnpm --filter @cpane/cli dev -- <args>   # run the CLI from source
pnpm gate                                # lint, format check, typecheck, build, test
```

- **Language/runtime:** TypeScript on Bun, compiled to a self-contained
  binary via `bun build --compile` — no Bun/Node install required on the
  machine that runs `cpane`.
- **TUI:** [OpenTUI](https://github.com/anomalyco/opentui) (React renderer)
  for the connect-time picker and the `add --wizard` flow.
- **Schema validation:** `zod`. No Effect — see `docs/PRD.md` §7 for why.
- **Lint/format:** oxlint / oxfmt. **Tests:** vitest.
- **Versioning:** [Changesets](https://github.com/changesets/changesets) —
  run `pnpm changeset` alongside any user-facing change. Merging the
  generated "Version Packages" PR only bumps `apps/cli/package.json` and
  `CHANGELOG.md`; pushing the actual `vX.Y.Z`/`vX.Y.Z-rc.N` tag is a
  separate, deliberate step (see `.github/workflows/`).

### Repo layout

```
apps/cli/          the only app package (pnpm + Turborepo monorepo)
  src/core/         profile schema/loader, ssh-config parsing, tmux command
                     building + live-session diff/capture, config-dir/channel
                     resolution, self-update
  src/commands/     one module per CLI command, including the OpenTUI
                     picker (picker.tsx) and wizard (wizard.tsx)
  test/             vitest specs mirroring src/core
docs/PRD.md         the product spec this implementation follows
```

### Known upstream issue (patched)

`@opentui/core@0.4.5` resolves its tree-sitter worker asset via a top-level
`await` that throws when bundled by `bun build --compile` — a bug that
crashed *every* compiled-binary invocation, not just when syntax
highlighting is actually rendered. `patches/@opentui__core@0.4.5.patch`
wraps that resolution in a `try/catch`, deferring any failure to first
actual use (which cPane's picker/wizard screens never trigger). Safe to
drop once upstream fixes it.
