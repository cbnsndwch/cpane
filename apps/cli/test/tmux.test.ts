import { describe, expect, it } from 'vitest';

import type { Profile } from '../src/core/profile-schema.ts';
import {
    buildAttachCommand,
    buildBootstrapCommands,
    buildGapCommands,
    buildInspectScript,
    captureProfileFromLive,
    describeGap,
    diffLayout,
    parseInspectOutput,
    shQuote,
    type LiveWindow,
} from '../src/core/tmux.ts';

const PROFILE: Profile = {
    host: 'app-vm',
    windows: [
        { name: 'app', cwd: '~/app', command: 'npm run dev' },
        {
            name: 'logs',
            cwd: '~/app/logs',
            panes: [
                { command: 'tail -f app.log', split: 'horizontal' },
                {
                    cwd: '~/app',
                    command: 'htop',
                    size: '30%',
                    split: 'vertical',
                },
            ],
        },
        { name: 'scratch', cwd: '~/app' },
    ],
};

describe('shQuote', () => {
    it('wraps plain values in single quotes', () => {
        expect(shQuote('npm run dev')).toBe("'npm run dev'");
    });

    it('escapes embedded single quotes', () => {
        expect(shQuote("it's")).toBe("'it'\\''s'");
    });
});

describe('buildBootstrapCommands', () => {
    it('builds the exact command sequence for a multi-window/multi-pane profile', () => {
        expect(buildBootstrapCommands('myapp', PROFILE)).toEqual([
            "tmux new-session -d -s 'myapp' -n 'app' -c '~/app'",
            "tmux send-keys -t 'myapp:app.0' 'npm run dev' Enter",
            "tmux new-window -t 'myapp' -n 'logs' -c '~/app/logs'",
            "tmux send-keys -t 'myapp:logs.0' 'tail -f app.log' Enter",
            "tmux split-window -t 'myapp:logs.0' -v -c '~/app' -l '30%'",
            "tmux send-keys -t 'myapp:logs.1' 'htop' Enter",
            "tmux new-window -t 'myapp' -n 'scratch' -c '~/app'",
        ]);
    });

    it('omits -c when a window has no cwd and no command when none is set', () => {
        const profile: Profile = { host: 'h', windows: [{ name: 'w' }] };
        expect(buildBootstrapCommands('s', profile)).toEqual([
            "tmux new-session -d -s 's' -n 'w'",
        ]);
    });

    it('falls back a pane cwd to the window cwd when omitted', () => {
        const profile: Profile = {
            host: 'h',
            windows: [
                {
                    name: 'w',
                    cwd: '~/app',
                    panes: [
                        { split: 'horizontal' },
                        { split: 'horizontal', command: 'htop' },
                    ],
                },
            ],
        };
        const commands = buildBootstrapCommands('s', profile);
        expect(commands).toContain(
            "tmux split-window -t 's:w.0' -h -c '~/app'",
        );
    });
});

describe('buildAttachCommand', () => {
    it('attaches by session name', () => {
        expect(buildAttachCommand('myapp')).toBe(
            "tmux attach-session -t 'myapp'",
        );
    });
});

describe('buildInspectScript', () => {
    it('prints $HOME then checks/lists the session', () => {
        expect(buildInspectScript('myapp')).toBe(
            [
                `printf '%s\\n' "$HOME"`,
                `tmux has-session -t 'myapp' 2>/dev/null`,
                `tmux list-panes -s -t 'myapp' -F '#{window_index}\t#{window_name}\t#{pane_index}\t#{pane_current_path}\t#{pane_left}\t#{pane_top}\t#{pane_width}\t#{pane_height}'`,
            ].join(' && '),
        );
    });
});

describe('parseInspectOutput', () => {
    it('reports a nonexistent session from a nonzero exit code', () => {
        const result = parseInspectOutput('/home/serge\n', 1);
        expect(result).toEqual({
            exists: false,
            home: '/home/serge',
            windows: [],
        });
    });

    it('parses grouped, sorted windows and panes from pane rows', () => {
        const stdout = [
            '/home/serge',
            '0\tapp\t0\t/home/serge/app\t0\t0\t80\t24',
            '1\tlogs\t0\t/home/serge/app/logs\t0\t0\t80\t12',
            '1\tlogs\t1\t/home/serge/app\t0\t12\t80\t12',
            '2\tscratch\t0\t/home/serge/app\t0\t0\t80\t24',
            '',
        ].join('\n');

        const result = parseInspectOutput(stdout, 0);
        expect(result.exists).toBe(true);
        expect(result.home).toBe('/home/serge');
        expect(result.windows.map(w => w.name)).toEqual([
            'app',
            'logs',
            'scratch',
        ]);
        expect(result.windows[1]?.panes).toHaveLength(2);
        expect(result.windows[1]?.panes[1]).toEqual({
            index: 1,
            cwd: '/home/serge/app',
            left: 0,
            top: 12,
            width: 80,
            height: 12,
        });
    });
});

describe('diffLayout', () => {
    const liveWindows: LiveWindow[] = [
        {
            index: 0,
            name: 'app',
            panes: [
                {
                    index: 0,
                    cwd: '/home/serge/app',
                    left: 0,
                    top: 0,
                    width: 80,
                    height: 24,
                },
            ],
        },
        {
            index: 1,
            name: 'logs',
            panes: [
                {
                    index: 0,
                    cwd: '/home/serge/app/logs',
                    left: 0,
                    top: 0,
                    width: 80,
                    height: 24,
                },
            ],
        },
    ];

    it('flags a wholly missing window and missing panes in an existing one', () => {
        const gaps = diffLayout(PROFILE, liveWindows);
        expect(gaps).toEqual([
            {
                kind: 'missing-panes',
                window: PROFILE.windows[1],
                fromPaneIndex: 1,
            },
            { kind: 'missing-window', window: PROFILE.windows[2] },
        ]);
    });

    it('reports no gaps when the live session already satisfies the profile', () => {
        const satisfied: LiveWindow[] = [
            liveWindows[0]!,
            {
                index: 1,
                name: 'logs',
                panes: [
                    {
                        index: 0,
                        cwd: 'x',
                        left: 0,
                        top: 0,
                        width: 80,
                        height: 12,
                    },
                    {
                        index: 1,
                        cwd: 'x',
                        left: 0,
                        top: 12,
                        width: 80,
                        height: 12,
                    },
                ],
            },
            {
                index: 2,
                name: 'scratch',
                panes: [
                    {
                        index: 0,
                        cwd: 'x',
                        left: 0,
                        top: 0,
                        width: 80,
                        height: 24,
                    },
                ],
            },
        ];
        expect(diffLayout(PROFILE, satisfied)).toEqual([]);
    });

    it("never flags extra live windows/panes the profile doesn't declare", () => {
        const extra: LiveWindow[] = [
            ...liveWindows,
            {
                index: 1,
                name: 'logs',
                panes: [
                    ...liveWindows[1]!.panes,
                    {
                        index: 1,
                        cwd: 'x',
                        left: 0,
                        top: 12,
                        width: 80,
                        height: 12,
                    },
                ],
            },
            {
                index: 2,
                name: 'scratch',
                panes: [
                    {
                        index: 0,
                        cwd: 'x',
                        left: 0,
                        top: 0,
                        width: 80,
                        height: 24,
                    },
                ],
            },
            {
                index: 3,
                name: 'extra-live-window',
                panes: [
                    {
                        index: 0,
                        cwd: 'x',
                        left: 0,
                        top: 0,
                        width: 80,
                        height: 24,
                    },
                ],
            },
        ];
        const byName = new Map(extra.map(w => [w.name, w]));
        expect(diffLayout(PROFILE, [...byName.values()])).toEqual([]);
    });
});

describe('buildGapCommands + describeGap', () => {
    it('builds only the missing pieces, targeting the last live pane for a partial window', () => {
        const gaps = diffLayout(PROFILE, [
            {
                index: 0,
                name: 'app',
                panes: [
                    {
                        index: 0,
                        cwd: 'x',
                        left: 0,
                        top: 0,
                        width: 80,
                        height: 24,
                    },
                ],
            },
            {
                index: 1,
                name: 'logs',
                panes: [
                    {
                        index: 0,
                        cwd: 'x',
                        left: 0,
                        top: 0,
                        width: 80,
                        height: 24,
                    },
                ],
            },
        ]);

        expect(gaps.map(describeGap)).toEqual([
            '1 pane in window "logs"',
            'window "scratch" (1 pane)',
        ]);

        expect(buildGapCommands('myapp', gaps)).toEqual([
            "tmux split-window -t 'myapp:logs.0' -v -c '~/app' -l '30%'",
            "tmux send-keys -t 'myapp:logs.1' 'htop' Enter",
            "tmux new-window -t 'myapp' -n 'scratch' -c '~/app'",
        ]);
    });
});

describe('captureProfileFromLive', () => {
    it('reconstructs windows/panes, tildifying cwds under $HOME', () => {
        const liveWindows: LiveWindow[] = [
            {
                index: 0,
                name: 'app',
                panes: [
                    {
                        index: 0,
                        cwd: '/home/serge/app',
                        left: 0,
                        top: 0,
                        width: 80,
                        height: 24,
                    },
                ],
            },
            {
                index: 1,
                name: 'logs',
                panes: [
                    {
                        index: 0,
                        cwd: '/home/serge/app/logs',
                        left: 0,
                        top: 0,
                        width: 80,
                        height: 12,
                    },
                    {
                        index: 1,
                        cwd: '/home/serge/app',
                        left: 0,
                        top: 12,
                        width: 80,
                        height: 12,
                    },
                ],
            },
        ];

        const profile = captureProfileFromLive(
            'app-vm',
            liveWindows,
            '/home/serge',
        );
        expect(profile).toEqual({
            host: 'app-vm',
            windows: [
                { name: 'app', cwd: '~/app' },
                {
                    name: 'logs',
                    panes: [
                        { cwd: '~/app/logs', split: 'horizontal' },
                        { cwd: '~/app', split: 'vertical', size: '50%' },
                    ],
                },
            ],
        });
    });

    it('leaves cwd outside $HOME untouched', () => {
        const liveWindows: LiveWindow[] = [
            {
                index: 0,
                name: 'w',
                panes: [
                    {
                        index: 0,
                        cwd: '/var/log',
                        left: 0,
                        top: 0,
                        width: 80,
                        height: 24,
                    },
                ],
            },
        ];
        const profile = captureProfileFromLive('h', liveWindows, '/home/serge');
        expect(profile.windows[0]).toEqual({ name: 'w', cwd: '/var/log' });
    });
});
