import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    findProfilePath: vi.fn(),
    launchVscodeRemote: vi.fn(),
    loadProfileFile: vi.fn(),
    sshExec: vi.fn(),
    sshInteractive: vi.fn(),
}));

vi.mock('../src/core/profile-loader.ts', () => ({
    findProfilePath: mocks.findProfilePath,
    loadProfileFile: mocks.loadProfileFile,
    ProfileValidationError: class ProfileValidationError extends Error {},
}));

vi.mock('../src/core/ssh-exec.ts', () => ({
    isSshUnreachable: (result: { stdout: string; exitCode: number }) =>
        result.exitCode !== 0 && result.stdout.trim() === '',
    sshExec: mocks.sshExec,
    sshInteractive: mocks.sshInteractive,
}));

vi.mock('../src/core/vscode.ts', async importOriginal => {
    const actual =
        await importOriginal<typeof import('../src/core/vscode.ts')>();
    return { ...actual, launchVscodeRemote: mocks.launchVscodeRemote };
});

import { runConnect } from '../src/commands/connect.ts';
import type { CpaneContext } from '../src/core/config-dir.ts';

const CONTEXT: CpaneContext = {
    channel: 'stable',
    binaryName: 'cpane',
    configDir: '/tmp/cpane',
    profilesDir: '/tmp/cpane/profiles',
    updateCachePath: '/tmp/cpane/update-cache.json',
};

describe('runConnect VS Code integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.findProfilePath.mockResolvedValue('/tmp/cpane/profiles/app.yaml');
        mocks.loadProfileFile.mockResolvedValue({
            host: 'app-vm',
            windows: [{ name: 'main' }],
        });
        mocks.sshExec.mockResolvedValue({
            stdout: '/home/remote\n',
            exitCode: 1,
        });
        mocks.sshInteractive.mockResolvedValue(0);
        mocks.launchVscodeRemote.mockResolvedValue(undefined);
    });

    it('launches local VS Code for an opted-in profile', async () => {
        mocks.loadProfileFile.mockResolvedValue({
            host: 'app-vm',
            vscode: { directory: '~/project' },
            windows: [{ name: 'main' }],
        });

        await expect(runConnect(CONTEXT, 'app')).resolves.toBe(0);

        expect(mocks.launchVscodeRemote).toHaveBeenCalledWith(
            'app-vm',
            '/home/remote/project',
        );
        expect(mocks.sshInteractive).toHaveBeenCalledOnce();
    });

    it('does not launch VS Code when the stanza is absent', async () => {
        await expect(runConnect(CONTEXT, 'app')).resolves.toBe(0);

        expect(mocks.launchVscodeRemote).not.toHaveBeenCalled();
        expect(mocks.sshInteractive).toHaveBeenCalledOnce();
    });

    it('reports a launcher failure and does not attach tmux', async () => {
        mocks.loadProfileFile.mockResolvedValue({
            host: 'app-vm',
            vscode: { directory: '/srv/project' },
            windows: [{ name: 'main' }],
        });
        mocks.launchVscodeRemote.mockRejectedValue(
            new Error('spawn code ENOENT'),
        );
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(runConnect(CONTEXT, 'app')).resolves.toBe(1);

        expect(error).toHaveBeenCalledWith(
            'Could not launch local VS Code: spawn code ENOENT',
        );
        expect(mocks.sshInteractive).not.toHaveBeenCalled();
        error.mockRestore();
    });
});
