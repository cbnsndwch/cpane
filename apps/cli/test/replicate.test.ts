import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { profilesDirFor } from '../src/core/config-dir.ts';
import { writeProfileFile } from '../src/core/profile-loader.ts';
import type { Profile } from '../src/core/profile-schema.ts';
import { replicateStableProfilesToRc } from '../src/core/replicate.ts';

const PROFILE: Profile = { host: 'h', windows: [{ name: 'w' }] };

describe('replicateStableProfilesToRc', () => {
    let originalHome: string | undefined;
    let tmpHome: string;

    beforeEach(async () => {
        originalHome = process.env.HOME;
        tmpHome = await mkdtemp(join(tmpdir(), 'cpane-home-'));
        process.env.HOME = tmpHome;
    });

    afterEach(async () => {
        if (originalHome === undefined) delete process.env.HOME;
        else process.env.HOME = originalHome;
        await rm(tmpHome, { recursive: true, force: true });
    });

    it('copies stable profiles into an empty rc config', async () => {
        const stableDir = profilesDirFor('cpane');
        await mkdir(stableDir, { recursive: true });
        await writeProfileFile(join(stableDir, 'app.yaml'), PROFILE);

        const result = await replicateStableProfilesToRc();
        expect(result.copiedOrUpdated).toEqual(['app']);

        const rcDir = profilesDirFor('cpanext');
        expect(await readdir(rcDir)).toEqual(['app.yaml']);
    });

    it('leaves rc-only profiles untouched', async () => {
        const stableDir = profilesDirFor('cpane');
        const rcDir = profilesDirFor('cpanext');
        await mkdir(stableDir, { recursive: true });
        await mkdir(rcDir, { recursive: true });
        await writeProfileFile(join(stableDir, 'app.yaml'), PROFILE);
        await writeProfileFile(join(rcDir, 'rc-only.yaml'), PROFILE);

        await replicateStableProfilesToRc();

        expect((await readdir(rcDir)).toSorted()).toEqual([
            'app.yaml',
            'rc-only.yaml',
        ]);
    });

    it('stable wins on name collisions, even across a format change', async () => {
        const stableDir = profilesDirFor('cpane');
        const rcDir = profilesDirFor('cpanext');
        await mkdir(stableDir, { recursive: true });
        await mkdir(rcDir, { recursive: true });

        await writeProfileFile(join(stableDir, 'app.yaml'), {
            host: 'stable-host',
            windows: [{ name: 'w' }],
        });
        // rc has a stale copy of the same profile, under a different extension.
        await writeProfileFile(join(rcDir, 'app.toml'), {
            host: 'rc-host',
            windows: [{ name: 'w' }],
        });

        await replicateStableProfilesToRc();

        expect(await readdir(rcDir)).toEqual(['app.yaml']);
    });
});
