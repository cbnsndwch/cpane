import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('cross-spawn', () => ({ default: spawnMock }));

import {
    buildVscodeRemoteArgs,
    launchVscodeRemote,
    resolveVscodeDirectory,
} from '../src/core/vscode.ts';

describe('VS Code remote launch', () => {
    beforeEach(() => {
        spawnMock.mockReset();
    });

    it('builds the official Remote - SSH CLI arguments', () => {
        expect(buildVscodeRemoteArgs('app-vm', '/srv/app')).toEqual([
            '--remote',
            'ssh-remote+app-vm',
            '/srv/app',
        ]);
    });

    it('expands a leading tilde against the discovered remote home', () => {
        expect(resolveVscodeDirectory('~', '/home/serge')).toBe('/home/serge');
        expect(resolveVscodeDirectory('~/app', '/home/serge/')).toBe(
            '/home/serge/app',
        );
        expect(resolveVscodeDirectory('/srv/app', '/home/serge')).toBe(
            '/srv/app',
        );
    });

    it('spawns and detaches the local code client', async () => {
        const child = new EventEmitter() as EventEmitter & {
            unref: ReturnType<typeof vi.fn>;
        };
        child.unref = vi.fn();
        spawnMock.mockReturnValue(child);

        const launched = launchVscodeRemote('app-vm', '/srv/app');
        child.emit('spawn');
        await launched;

        expect(spawnMock).toHaveBeenCalledWith(
            'code',
            ['--remote', 'ssh-remote+app-vm', '/srv/app'],
            { detached: true, stdio: 'ignore', windowsHide: true },
        );
        expect(child.unref).toHaveBeenCalledOnce();
    });

    it('reports a local code launcher failure', async () => {
        const child = new EventEmitter();
        spawnMock.mockReturnValue(child);

        const launched = launchVscodeRemote('app-vm', '/srv/app');
        const error = new Error('spawn code ENOENT');
        child.emit('error', error);

        await expect(launched).rejects.toBe(error);
    });
});
