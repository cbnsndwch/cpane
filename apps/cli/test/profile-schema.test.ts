import { describe, expect, it } from 'vitest';

import { parseProfile } from '../src/core/profile-schema.ts';

const VALID_PROFILE = {
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

describe('parseProfile', () => {
    it('accepts the PRD reference profile', () => {
        const profile = parseProfile(VALID_PROFILE);
        expect(profile.host).toBe('app-vm');
        expect(profile.windows).toHaveLength(3);
        expect(profile.windows[1]?.panes).toHaveLength(2);
    });

    it('rejects a missing host', () => {
        expect(() =>
            parseProfile({ windows: VALID_PROFILE.windows }),
        ).toThrow();
    });

    it('rejects a window with both command and panes', () => {
        expect(() =>
            parseProfile({
                host: 'app-vm',
                windows: [
                    {
                        name: 'app',
                        command: 'npm run dev',
                        panes: [{ split: 'horizontal' }],
                    },
                ],
            }),
        ).toThrow(/mutually exclusive/);
    });

    it('rejects duplicate window names', () => {
        expect(() =>
            parseProfile({
                host: 'app-vm',
                windows: [{ name: 'app' }, { name: 'app' }],
            }),
        ).toThrow(/unique/);
    });

    it('rejects a pane missing `split`', () => {
        expect(() =>
            parseProfile({
                host: 'app-vm',
                windows: [{ name: 'app', panes: [{ command: 'htop' }] }],
            }),
        ).toThrow();
    });

    it('rejects an empty windows array', () => {
        expect(() => parseProfile({ host: 'app-vm', windows: [] })).toThrow();
    });

    it('rejects unknown top-level fields', () => {
        expect(() =>
            parseProfile({ ...VALID_PROFILE, sessionName: 'override' }),
        ).toThrow();
    });
});
