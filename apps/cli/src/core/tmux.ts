import {
    parseProfile,
    type Pane,
    type Profile,
    type Window,
} from './profile-schema.ts';

/** Single-quotes a value for safe embedding in the remote shell command line. */
export function shQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

function paneTarget(
    session: string,
    windowName: string,
    paneIndex: number,
): string {
    return `${session}:${windowName}.${paneIndex}`;
}

function windowInitialCwd(window: Window): string | undefined {
    return window.panes ? (window.panes[0]?.cwd ?? window.cwd) : window.cwd;
}

function buildSendKeysCommand(
    session: string,
    windowName: string,
    paneIndex: number,
    command: string,
): string {
    return `tmux send-keys -t ${shQuote(paneTarget(session, windowName, paneIndex))} ${shQuote(command)} Enter`;
}

function buildNewSessionCommand(session: string, window: Window): string {
    const cwd = windowInitialCwd(window);
    const parts = [
        'tmux',
        'new-session',
        '-d',
        '-s',
        shQuote(session),
        '-n',
        shQuote(window.name),
    ];
    if (cwd) parts.push('-c', shQuote(cwd));
    return parts.join(' ');
}

function buildNewWindowCommand(session: string, window: Window): string {
    const cwd = windowInitialCwd(window);
    const parts = [
        'tmux',
        'new-window',
        '-t',
        shQuote(session),
        '-n',
        shQuote(window.name),
    ];
    if (cwd) parts.push('-c', shQuote(cwd));
    return parts.join(' ');
}

/** The startup command for a window's pane 0, if any — sent after creation. */
function buildInitialPaneCommand(session: string, window: Window): string[] {
    const command = window.panes ? window.panes[0]?.command : window.command;
    return command
        ? [buildSendKeysCommand(session, window.name, 0, command)]
        : [];
}

/**
 * Splits for panes[startIndex..]. Each pane splits off the immediately
 * preceding pane (PRD §6.1: "relative to prior pane") — so pane N's target
 * is always pane N-1, which by construction already exists (either created
 * earlier in this same call, or already live when filling a gap).
 */
function buildAdditionalPanesCommands(
    session: string,
    window: Window,
    startIndex = 1,
): string[] {
    const panes = window.panes;
    if (!panes) return [];

    const commands: string[] = [];
    for (let i = startIndex; i < panes.length; i++) {
        const pane = panes[i]!;
        const parts = [
            'tmux',
            'split-window',
            '-t',
            shQuote(paneTarget(session, window.name, i - 1)),
            pane.split === 'horizontal' ? '-h' : '-v',
        ];
        const cwd = pane.cwd ?? window.cwd;
        if (cwd) parts.push('-c', shQuote(cwd));
        if (pane.size) parts.push('-l', shQuote(pane.size));
        commands.push(parts.join(' '));
        if (pane.command)
            commands.push(
                buildSendKeysCommand(session, window.name, i, pane.command),
            );
    }
    return commands;
}

function buildWindowCommands(
    session: string,
    window: Window,
    isFirst: boolean,
): string[] {
    return [
        isFirst
            ? buildNewSessionCommand(session, window)
            : buildNewWindowCommand(session, window),
        ...buildInitialPaneCommand(session, window),
        ...buildAdditionalPanesCommands(session, window),
    ];
}

/** Full bootstrap for a session that doesn't exist yet — does not attach. */
export function buildBootstrapCommands(
    session: string,
    profile: Profile,
): string[] {
    return profile.windows.flatMap((window, index) =>
        buildWindowCommands(session, window, index === 0),
    );
}

export function buildAttachCommand(session: string): string {
    return `tmux attach-session -t ${shQuote(session)}`;
}

export function joinRemoteScript(commands: string[]): string {
    return commands.join(' ; ');
}

// --- Live session inspection ---------------------------------------------

const PANE_FIELDS = [
    'window_index',
    'window_name',
    'pane_index',
    'pane_current_path',
    'pane_left',
    'pane_top',
    'pane_width',
    'pane_height',
] as const;

const LIST_PANES_FORMAT = PANE_FIELDS.map(field => `#{${field}}`).join('\t');

/**
 * One non-interactive round trip that answers "does this session exist" and,
 * if so, its full live window/pane geometry — reused by both the connect-time
 * gap diff and `sync`. `$HOME` is printed first so callers can render cwds
 * back into `~`-relative form.
 */
export function buildInspectScript(session: string): string {
    return [
        `printf '%s\\n' "$HOME"`,
        `tmux has-session -t ${shQuote(session)} 2>/dev/null`,
        `tmux list-panes -s -t ${shQuote(session)} -F ${shQuote(LIST_PANES_FORMAT)}`,
    ].join(' && ');
}

export interface LivePane {
    index: number;
    cwd: string;
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface LiveWindow {
    index: number;
    name: string;
    panes: LivePane[];
}

export interface InspectResult {
    exists: boolean;
    home: string;
    windows: LiveWindow[];
}

export function parseInspectOutput(
    stdout: string,
    exitCode: number,
): InspectResult {
    const lines = stdout.split('\n');
    const home = lines[0] ?? '';

    if (exitCode !== 0) {
        return { exists: false, home, windows: [] };
    }

    const byName = new Map<string, LiveWindow>();
    for (const line of lines.slice(1)) {
        if (!line.trim()) continue;
        const [
            windowIndex,
            windowName,
            paneIndex,
            cwd,
            left,
            top,
            width,
            height,
        ] = line.split('\t');
        if (windowName === undefined || cwd === undefined) continue;

        let window = byName.get(windowName);
        if (!window) {
            window = {
                index: Number(windowIndex),
                name: windowName,
                panes: [],
            };
            byName.set(windowName, window);
        }
        window.panes.push({
            index: Number(paneIndex),
            cwd,
            left: Number(left),
            top: Number(top),
            width: Number(width),
            height: Number(height),
        });
    }

    const windows = [...byName.values()].toSorted((a, b) => a.index - b.index);
    for (const window of windows)
        window.panes = window.panes.toSorted((a, b) => a.index - b.index);
    return { exists: true, home, windows };
}

// --- Diff (connect attach semantics) --------------------------------------

export interface MissingWindowGap {
    kind: 'missing-window';
    window: Window;
}

export interface MissingPanesGap {
    kind: 'missing-panes';
    window: Window;
    /** First pane index (0-based) not yet present live. */
    fromPaneIndex: number;
}

export type LayoutGap = MissingWindowGap | MissingPanesGap;

/**
 * Windows/panes the profile declares that the live session lacks. Never
 * flags extra live windows/panes the profile doesn't mention — those are
 * left alone (PRD §6.2).
 */
export function diffLayout(
    profile: Profile,
    liveWindows: LiveWindow[],
): LayoutGap[] {
    const liveByName = new Map(
        liveWindows.map(window => [window.name, window]),
    );
    const gaps: LayoutGap[] = [];

    for (const window of profile.windows) {
        const declaredPaneCount = window.panes?.length ?? 1;
        const live = liveByName.get(window.name);

        if (!live) {
            gaps.push({ kind: 'missing-window', window });
            continue;
        }
        if (live.panes.length < declaredPaneCount) {
            gaps.push({
                kind: 'missing-panes',
                window,
                fromPaneIndex: live.panes.length,
            });
        }
    }

    return gaps;
}

export function buildGapCommands(session: string, gaps: LayoutGap[]): string[] {
    return gaps.flatMap(gap =>
        gap.kind === 'missing-window'
            ? buildWindowCommands(session, gap.window, false)
            : buildAdditionalPanesCommands(
                  session,
                  gap.window,
                  gap.fromPaneIndex,
              ),
    );
}

export function describeGap(gap: LayoutGap): string {
    if (gap.kind === 'missing-window') {
        const paneCount = gap.window.panes?.length ?? 1;
        return `window "${gap.window.name}" (${paneCount} pane${paneCount === 1 ? '' : 's'})`;
    }
    const total = gap.window.panes?.length ?? 1;
    const missing = total - gap.fromPaneIndex;
    return `${missing} pane${missing === 1 ? '' : 's'} in window "${gap.window.name}"`;
}

// --- Capture (sync) --------------------------------------------------------

function tildify(path: string, home: string): string {
    if (!home) return path;
    if (path === home) return '~';
    return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

function windowBounds(panes: LivePane[]): { width: number; height: number } {
    let width = 0;
    let height = 0;
    for (const pane of panes) {
        width = Math.max(width, pane.left + pane.width);
        height = Math.max(height, pane.top + pane.height);
    }
    return { width, height };
}

/**
 * Reconstructs profile windows/panes from a live session's geometry. Our
 * schema only models a linear chain of splits (each pane relative to the
 * one before it), so this is a best-effort approximation of tmux's actual
 * pane tree — exact for sessions cPane itself built, approximate for
 * hand-grown ones with more exotic layouts. Split direction/size are
 * inferred from each pane's position and size relative to the window's
 * bounding box; the very first pane's `split` value is a required-but-unused
 * placeholder (nothing precedes it to split from).
 */
export function captureProfileFromLive(
    host: string,
    liveWindows: LiveWindow[],
    home: string,
): Profile {
    const windows: Window[] = liveWindows.map(liveWindow => {
        if (liveWindow.panes.length <= 1) {
            const cwd = liveWindow.panes[0]?.cwd;
            return cwd
                ? { name: liveWindow.name, cwd: tildify(cwd, home) }
                : { name: liveWindow.name };
        }

        const bounds = windowBounds(liveWindow.panes);
        const panes: Pane[] = liveWindow.panes.map((pane, index) => {
            const cwd = tildify(pane.cwd, home);
            if (index === 0) return { cwd, split: 'horizontal' };

            const prior = liveWindow.panes[index - 1]!;
            const horizontal = pane.left !== prior.left;
            const sizePercent = horizontal
                ? Math.round((pane.width / bounds.width) * 100)
                : Math.round((pane.height / bounds.height) * 100);

            return {
                cwd,
                split: horizontal ? 'horizontal' : 'vertical',
                size: `${sizePercent}%`,
            };
        });

        return { name: liveWindow.name, panes };
    });

    return parseProfile({ host, windows });
}
