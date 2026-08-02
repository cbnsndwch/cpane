# cPane — Product Requirements Document

- **Status:** Draft from `/grilling` interview
- **Date:** 2026-08-02
- **Owner:** serge (cbnsndwch)

## 1. Summary

cPane (`cpane`) is a personal, cross-platform CLI that replaces a growing set of
ad hoc PowerShell functions (see `.local/pwsh/profile.ps1`) for launching and
attaching to `tmux` sessions on remote hosts. Instead of hand-written,
duplicated PowerShell functions per host, the user defines declarative
**profiles** — named sessions with full multi-window/multi-pane `tmux`
layouts — and connects with a single short command.

## 2. Problem Statement

Today, connecting to a remote host's `tmux` session requires a bespoke
PowerShell function per host (five hosts' worth, in
`.local/pwsh/profile.ps1`). This is unsustainable because:

- The user has to remember which sessions are open or desired.
- Most functions don't set a working directory on the remote server at all;
  the one that does hardcodes it.
- Adding/updating a host means writing/editing another PowerShell function,
  with duplicated `ssh -t ... "tmux ..."` boilerplate each time.
- There's no way to express a multi-window/multi-pane layout — every
  function opens exactly one session, one pane.

## 3. Goals

- Replace per-host PowerShell functions with declarative, file-based profiles.
- Support full `tmux` layouts: multiple named windows per session, each
  optionally split into multiple panes, each with its own working directory
  and startup command.
- Make connecting fast: fewer keystrokes than today's PowerShell functions,
  not more.
- Ship as a self-contained binary with no runtime prerequisite on the
  machines that run it.
- Support a stable + release-candidate channel so new features/schema
  changes can be tried without risking the daily-driver setup.

## 4. Non-Goals (v1)

- No remote-side provisioning: cPane does not install `tmux`, creates remote
  directories, or otherwise mutates the remote host. Profiles are pure local
  connection/layout metadata; if a directory or tool is missing remotely,
  that's on the user to fix, same as today.
- No SSH connection-detail management: cPane never stores hostnames, users,
  ports, or identity files. It only ever references an existing `Host` alias
  in `~/.ssh/config` and delegates all connection resolution to the real
  `ssh` binary. When reading ssh profiles, cPane limits its reading to teh lines
  that contain profile names only to avoid reading credentials or other details.
- No live "is this session running" status in the default picker/list (see
  §11 Future Work).
- No macOS build targets (the user doesn't run cPane from a Mac).

## 5. Users

Single user (serge), running cPane from a Windows 11 + PowerShell 7 machine
and from Linux boxes, connecting out to a handful of remote Linux/BSD hosts
that run `tmux`.

## 6. Product Surface

### 6.1 Profiles

A profile is a **durable named session**: the profile name *is* the tmux
session name (1:1). Running multiple concurrent sessions against the same
host is achieved by defining multiple profiles that share the same `host:`
value — there is no session-name override flag.

Each profile is a single file in the profile directory, named after the
profile (e.g. `app.yaml`, `web-scratch.toml`). Supported formats:
YAML, JSON, JSONC/JSON5, and TOML — auto-detected by file extension. Any
format can be hand-written or hand-edited; when cPane itself generates a new
profile file, it defaults to **YAML**.

**Schema:**

```yaml
# app.yaml
host: app-vm          # must match a `Host` alias in ~/.ssh/config
windows:
  - name: app
    cwd: ~/app
    command: npm run dev     # optional; omit to just land in a shell
  - name: logs
    cwd: ~/app/logs
    panes:
      - command: tail -f app.log
        split: horizontal    # horizontal | vertical, relative to prior pane
      - cwd: ~/app
        command: htop
        size: 30%             # optional; omit for tmux's default even split
  - name: scratch
    cwd: ~/app
```

Field reference:

| Field | Level | Required | Notes |
| --- | --- | --- | --- |
| `host` | profile | yes | Reference to a `Host` alias in `~/.ssh/config`. Never a hostname/user/port directly. |
| `windows[].name` | window | yes | Becomes the tmux window/tab name. |
| `windows[].cwd` | window | no | Working directory for the window (or its first/only pane). |
| `windows[].command` | window | no | Startup command for a single-pane window. Mutually exclusive with `panes`. |
| `windows[].panes` | window | no | List of panes; presence implies a split window. Mutually exclusive with `command`. |
| `panes[].cwd` | pane | no | Falls back to the parent window's `cwd` if omitted. |
| `panes[].command` | pane | no | Startup command for this pane. |
| `panes[].split` | pane | yes (if `panes` present) | `horizontal` or `vertical`, relative to the previous pane. |
| `panes[].size` | pane | no | Optional size (e.g. `30%`). Omit for tmux's default even split. |

### 6.2 Connecting

- `cpane <profile>` — implicit `connect`. No verb needed; this is the
  overwhelmingly common action (same reasoning as `ssh <host>` needing no
  verb).
- Bare `cpane` (no args) — opens an OpenTUI fuzzy-search picker over all
  profiles; enter connects to the selected one.
- **Attach semantics:** if the session already exists remotely, cPane
  attaches as-is and **never destructively modifies it**. It non-destructively
  diffs the live session's windows/panes against the profile's declared
  layout and, if the profile declares windows/panes that aren't currently
  present, **offers** to launch just the missing ones. Existing
  windows/panes not described in the profile (e.g. ones added live) are left
  alone. If the session doesn't exist yet, it's built fresh from the
  profile's layout, then attached.

  Rationale: tmux sessions are server-side and already survive client
  disconnects, reboots of the local machine, network drops, etc. There is no
  need for cPane to "restore" anything for an already-running session — the
  profile file only matters as a bootstrap template for sessions that don't
  exist yet (first connect, or recreating one after the remote host itself
  rebooted / lost its tmux server).

### 6.3 Syncing live changes back to a profile

- `cpane sync <profile>` — **explicit, manual only** (no automatic/background
  capture). Queries the live session's current window/pane structure (names,
  order, cwds, split layout) and writes it back into the profile file.
- Captures **structure only** — window/pane names, cwds, and split
  layout/sizing. Never captures "what's currently running" in a pane.
  `tmux` can only report a pane's foreground process name (e.g. `htop`), not
  the full command/args that started it, so auto-capturing commands would
  silently bake in one-off commands as permanent startup commands. Since the
  live session is the source of truth while the host is up, and the file is
  only a bootstrap template, capturing "what should exist" (structure) is
  sufficient — "what should run" is something the user re-invokes by hand
  after reconnecting.

### 6.4 Managing profiles

- `cpane add <name>` — scaffolds a starter profile file (minimal: a host
  picked from a quick list drawn from `~/.ssh/config`, one default window)
  and opens it in `$EDITOR`/`$VISUAL` for the user to flesh out.
- `cpane add --wizard` — guided OpenTUI flow: pick host, name the profile,
  add windows one at a time, optionally split into panes — no YAML required.
- `cpane edit <name>` — opens the existing profile file in `$EDITOR`.
- `cpane list` — static, instant list of profile names. No network calls, no
  live "is this running" status (see §11).

### 6.5 SSH config integration

cPane reads `~/.ssh/config` only to power pick-lists (in `add`/`--wizard`)
of known `Host` aliases. The parser handles **top-level `Host` lines only**
— no `Include`, `Match`, or wildcard-pattern resolution. (Verified: the
user's actual `~/.ssh/config` is flat `Host` blocks with no `Include`/`Match`
directives.) If a desired alias isn't found by the simple parser, the user
can still type it manually — this is a soft UX fallback, not a hard
dependency.

At connect time, cPane always shells out to the real `ssh` binary
(`ssh -t <host> "<tmux commands>"`) and lets `ssh` do all config resolution
itself, exactly as `profile.ps1` does today.

## 7. Technical Architecture

- **Language:** TypeScript.
- **Runtime:** [Bun](https://bun.sh). Compiled to a self-contained,
  single-file executable via `bun build --compile` — no Node/Bun install
  required on the machine that runs `cpane`.
- **TUI:** [OpenTUI](https://github.com/anomalyco/opentui) — the React-based
  terminal renderer built by the opencode team (Zig rendering core +
  TypeScript bindings + React reconciler). Requires Bun (consistent with the
  runtime choice above). Used for: the connect-time fuzzy picker, the
  `add --wizard` flow, and any future status views.

  > **Watch items (recheck periodically):** As of 2026-08-02, OpenTUI's core
  > still renders via Bun-specific `bun:ffi` bindings; Bun remains the
  > primary, fully-supported runtime. [PR #1149](https://github.com/anomalyco/opentui/pull/1149)
  > (merged 2026-06-08, shipped in v0.4.0) added Node.js 26 as a *secondary*
  > runtime, but only behind Node's `--experimental-ffi` flag, with several
  > features still Bun-exclusive and reports of lingering Node ESM import
  > issues as of 2026-07. No action needed now — Bun is still the right
  > primary target — but worth re-checking if Bun-specific pain ever shows
  > up, since a Node fallback may mature over time.
  >
  > Separately, [issue #807](https://github.com/anomalyco/opentui/issues/807)
  > reports that Markdown/tree-sitter syntax highlighting silently degrades
  > to plain text when distributed via `bun build --compile` (our exact
  > distribution method) unless `parser.worker.js` is shipped alongside the
  > binary with `OTUI_TREE_SITTER_WORKER_PATH` set. Not a concern for the
  > planned picker/wizard UI (no Markdown/syntax highlighting), but revisit
  > if any future screen renders either.
- **Repo layout:** pnpm + Turborepo monorepo. One app package for v1
  (`apps/cli`) — no premature `core`/`tui` package split, since nothing else
  consumes cPane's internals yet. Structured to make adding future apps
  (e.g. `apps/docs` for a marketing/docs site) straightforward later.
- **Lint/format:** oxlint + oxfmt (matches the `cbranch` project's toolchain).
- **Tests:** vitest.
- **Schema validation / error handling:** plain `zod` for profile-schema
  validation, plain `async`/`await` + `try/catch` elsewhere — **no Effect**.
  `cbranch` uses Effect (Schema + the full runtime: `Effect.gen`, `Layer`,
  structured concurrency) because it has real service boundaries that
  benefit from it: a plugin contract, an RPC surface between independently
  -evolving consumers, and a supervised long-running daemon. cPane has none
  of those — one package, a short-lived CLI invocation, simple sequential
  operations (shell out to `ssh`/`tmux`, parse a file, fetch a release).
  Adopting Effect's programming model here would be overhead without
  matching leverage.
- **Versioning/changelog:** [Changesets](https://github.com/changesets/changesets).
  Contributors (i.e. future-serge) add a changeset file per change; merging
  accumulates them into a "Version Packages" PR with the version bump and
  generated `CHANGELOG.md` entries. Merging that PR does **not** auto-publish
  — the release tag is pushed manually when ready (see §8).

## 8. Distribution & Release

### 8.1 Channels

Two channels, shipped as **two separate binaries** rather than a config
toggle:

| Channel | Binary name | Config/data dir |
| --- | --- | --- |
| Stable | `cpane` | isolated, e.g. `~/.config/cpane/` |
| RC / canary | `cpanext` | isolated, e.g. `~/.config/cpanext/` |

Both can be installed side-by-side. Config directories are fully isolated
(not shared) so an in-progress schema change on the rc channel can never
corrupt the stable installation's profiles.

A config-replication utility copies profiles from `cpane` → `cpanext` for
testing rc builds against real-world profiles: **merge** semantics (profiles
are added/updated by name into the rc config; rc-only test profiles that
don't exist in stable are left untouched), with **stable winning on name
collisions**.

### 8.2 Build targets

`windows-x64`, `linux-x64`, `linux-arm64` — no macOS targets. All three are
cross-compiled from a **single Ubuntu CI runner** using Bun's
`--target=bun-<platform>-<arch>` cross-compilation, rather than a per-OS
runner matrix — there's no OS-specific bundler/signing step (unlike e.g. a
Tauri app) that would require native runners.

### 8.3 Pipeline (mirrors `cbranch`'s structure)

- **CI** (every push/PR): gate job — lint (oxlint), format check (oxfmt),
  typecheck, build, test (vitest).
- **RC publish** — triggered by pushing a `vX.Y.Z-rc.N` tag (or manual
  `workflow_dispatch`): runs the gate, cross-compiles the `cpanext` binaries
  for all three targets, publishes a GitHub **prerelease**.
- **Stable publish** — triggered by pushing a `vX.Y.Z` tag (rejecting any
  tag containing `-`, so rc tags never trigger it): runs the gate,
  cross-compiles the `cpane` binaries, creates a **draft** release, then a
  final job downloads the draft's assets, generates `SHA256SUMS.txt`, pulls
  that version's changelog section (generated by Changesets) as the release
  body, and un-drafts it.
- **Release trigger is manual**: merging the Changesets "Version Packages"
  PR only bumps `package.json`/`CHANGELOG.md` on `main`. Pushing the actual
  `vX.Y.Z`/`vX.Y.Z-rc.N` tag — which is what kicks off a publish — is a
  separate, deliberate step the user takes when ready to ship.

### 8.4 Code signing

Binaries are **unsigned in v1**. Windows will show a SmartScreen "unknown
publisher" prompt on first run per machine/version — acceptable since the
user is the sole consumer and controls every machine that runs `cpane`.

**Potential next steps** (see also README):

- **Self-signing** (free): generate a self-signed certificate, sign builds
  in CI with the private key (GitHub secret), and import the certificate's
  public key into the Trusted Root/Publishers store on each of the user's
  own machines once. This suppresses SmartScreen *on those machines
  specifically* — it does not (and cannot) suppress it for arbitrary third
  parties, since SmartScreen's reputation system requires a CA-backed cert.
  This is the right first upgrade if the SmartScreen prompt becomes
  annoying, precisely because the user controls all target machines.
- **Azure Trusted Signing** (paid): a CA-backed signing service that would
  suppress SmartScreen for *any* user, not just machines that have
  explicitly trusted a self-signed cert. Only worth it if `cpane` is ever
  distributed beyond the user's own machines.

### 8.5 Self-update

- `cpane upgrade` (built in v1, not deferred): fetches the latest release
  for the binary's own channel (`cpane` → stable releases, `cpanext` → rc
  releases) and replaces the running binary in place.
- A background, **throttled** update check runs on every invocation:
  non-blocking (never delays the command the user actually ran), and reads
  from a local cache (`{lastChecked, latestKnownVersion}`) that's refreshed
  at most once per ~24h — avoiding both added startup latency and
  unauthenticated GitHub API rate limits. When a newer version is cached,
  the CLI prints a one-line notice; it never auto-installs.

## 9. Open Items / Future Work

- **Live status in the picker/list**: showing which profiles currently have
  an active remote session (e.g. a "●" marker) was explicitly deferred from
  v1 because it requires fanning out SSH checks per profile, adding latency
  and a new failure mode (unreachable host) to what's supposed to be an
  instant picker. Flagged as a likely fast-follow — most plausibly as its
  own explicitly-invoked `cpane status` command rather than baked into the
  default fast path.
- **Self-signing / Trusted Signing** — see §8.4.
- **Docs/marketing site** — the monorepo shape (pnpm + Turborepo) is chosen
  specifically to make adding an `apps/docs` package straightforward later,
  without needing to restructure `apps/cli`.
- **Competitive check (cmux, herdr):** evaluated two recently-popular
  multiplexer-adjacent tools before committing to building cPane —
  [cmux](https://github.com/manaflow-ai/cmux) (a native macOS GUI terminal
  app with local window/pane persistence, built for AI coding agents) and
  [herdr](https://github.com/ogulcancelik/herdr) (a Rust multiplexer specialized for running
  many AI agent panes in one session with automatic per-pane state
  detection). Neither overlaps meaningfully with cPane's goal: cmux operates
  on local GUI state on macOS only, herdr orchestrates agent-pane state
  within a single session — neither addresses cPane's actual problem
  (declarative, cross-host `tmux` layout templating over SSH aliases).
  Decided to proceed building cPane rather than adopt either.

## 10. Appendix: Reference — Current State Being Replaced

`.local/pwsh/profile.ps1` (excerpt of the user's Windows 11 PowerShell 7
profile) defines one function per host:

```powershell
function app {
    param([string]$Session = "main")
    $TargetDir = "~/app"
    $CreateSessionIfNotExists = "tmux new-session -d -s $Session -c $TargetDir 2>/dev/null"
    $AttachSession = "tmux attach-session -t $Session -c $TargetDir"
    ssh -t app-vm "$CreateSessionIfNotExists; $AttachSession"
}

function web {
    param([string]$Session = "main")
    ssh -t web "tmux new -A -s $Session"
}
```

cPane's `<profile>.yaml` + `cpane <profile>` replaces this pattern entirely,
generalizing "one cwd, one session" into full multi-window/multi-pane
layouts while keeping the same underlying mechanism (`ssh -t <host> "tmux
..."`).
