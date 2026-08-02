import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
    configDirFor,
    profilesDirFor,
    resolveChannel,
    resolveContext,
} from '../src/core/config-dir.ts';

describe('resolveChannel', () => {
    const originalEnv = process.env.CPANE_CHANNEL;

    afterEach(() => {
        if (originalEnv === undefined) delete process.env.CPANE_CHANNEL;
        else process.env.CPANE_CHANNEL = originalEnv;
    });

    it('detects cpanext from the executable name', () => {
        expect(resolveChannel('/usr/local/bin/cpanext')).toEqual({
            channel: 'rc',
            binaryName: 'cpanext',
        });
    });

    it('detects cpane from the executable name', () => {
        expect(resolveChannel('/usr/local/bin/cpane')).toEqual({
            channel: 'stable',
            binaryName: 'cpane',
        });
    });

    it('strips a .exe suffix on Windows', () => {
        expect(resolveChannel('C:\\tools\\cpanext.exe')).toEqual({
            channel: 'rc',
            binaryName: 'cpanext',
        });
    });

    it('defaults to stable for an unrecognized executable name (e.g. dev via bun)', () => {
        expect(resolveChannel('/usr/local/bin/bun')).toEqual({
            channel: 'stable',
            binaryName: 'cpane',
        });
    });

    it('lets CPANE_CHANNEL override the executable name', () => {
        process.env.CPANE_CHANNEL = 'rc';
        expect(resolveChannel('/usr/local/bin/cpane')).toEqual({
            channel: 'rc',
            binaryName: 'cpanext',
        });
    });
});

describe('config dir isolation', () => {
    it('keeps stable and rc config dirs fully separate', () => {
        const stable = configDirFor('cpane');
        const rc = configDirFor('cpanext');
        expect(stable).not.toBe(rc);
        expect(profilesDirFor('cpane')).toBe(join(stable, 'profiles'));
        expect(profilesDirFor('cpanext')).toBe(join(rc, 'profiles'));
    });
});

describe('resolveContext', () => {
    it('derives configDir/profilesDir/updateCachePath consistently', () => {
        const ctx = resolveContext('/usr/local/bin/cpanext');
        expect(ctx.channel).toBe('rc');
        expect(ctx.profilesDir).toBe(join(ctx.configDir, 'profiles'));
        expect(ctx.updateCachePath).toBe(
            join(ctx.configDir, 'update-cache.json'),
        );
    });
});
