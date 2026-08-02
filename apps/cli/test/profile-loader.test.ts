import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    detectFormat,
    findProfilePath,
    listProfileFiles,
    loadProfileFile,
    ProfileFormatError,
    ProfileValidationError,
    writeProfileFile,
    type ProfileFormat,
} from '../src/core/profile-loader.ts';
import type { Profile } from '../src/core/profile-schema.ts';

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
    ],
};

describe('detectFormat', () => {
    it.each([
        ['app.yaml', 'yaml'],
        ['app.yml', 'yaml'],
        ['app.json', 'json'],
        ['app.jsonc', 'jsonc'],
        ['app.json5', 'json5'],
        ['app.toml', 'toml'],
    ] satisfies [string, ProfileFormat][])(
        'maps %s to %s',
        (fileName, format) => {
            expect(detectFormat(fileName)).toBe(format);
        },
    );

    it('throws on unrecognized extensions', () => {
        expect(() => detectFormat('app.ini')).toThrow(ProfileFormatError);
    });
});

describe('round trips', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'cpane-profile-'));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it.each(['yaml', 'yml', 'json', 'jsonc', 'json5', 'toml'])(
        'round trips through .%s',
        async ext => {
            const filePath = join(dir, `app.${ext}`);
            await writeProfileFile(filePath, PROFILE);
            const loaded = await loadProfileFile(filePath);
            expect(loaded).toEqual(PROFILE);
        },
    );
});

describe('loadProfileFile', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'cpane-profile-'));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('raises a ProfileValidationError with the file path on invalid data', async () => {
        const filePath = join(dir, 'bad.yaml');
        await writeFile(filePath, 'host: app-vm\nwindows: []\n', 'utf8');
        await expect(loadProfileFile(filePath)).rejects.toThrow(
            ProfileValidationError,
        );
        await expect(loadProfileFile(filePath)).rejects.toThrow(/bad\.yaml/);
    });
});

describe('listProfileFiles / findProfilePath', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'cpane-profiles-'));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('returns an empty list for a missing directory', async () => {
        expect(await listProfileFiles(join(dir, 'does-not-exist'))).toEqual([]);
    });

    it('lists recognized profile files, ignoring others, sorted by name', async () => {
        await writeProfileFile(join(dir, 'web.yaml'), PROFILE);
        await writeProfileFile(join(dir, 'app.toml'), PROFILE);
        await writeFile(join(dir, 'README.md'), '# not a profile', 'utf8');

        const refs = await listProfileFiles(dir);
        expect(refs.map(ref => ref.name)).toEqual(['app', 'web']);
        expect(refs[0]?.format).toBe('toml');
    });

    it('finds a profile path by name', async () => {
        await writeProfileFile(join(dir, 'app.yaml'), PROFILE);
        expect(await findProfilePath(dir, 'app')).toBe(join(dir, 'app.yaml'));
        expect(await findProfilePath(dir, 'missing')).toBeUndefined();
    });
});
