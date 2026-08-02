import { copyFile, mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { profilesDirFor } from './config-dir.ts';
import { listProfileFiles } from './profile-loader.ts';

export interface ReplicateResult {
    /** Profile names copied/updated in the rc config from the stable config. */
    copiedOrUpdated: string[];
}

/**
 * Copies profiles from the stable (`cpane`) config into the rc (`cpanext`)
 * config so rc builds can be exercised against real-world profiles (PRD
 * §8.1). Always this direction, regardless of which binary invokes it.
 * Merge semantics: stable profiles are added/updated by name; rc-only test
 * profiles that don't exist in stable are left untouched; stable wins on
 * name collisions (even across a format-extension change).
 */
export async function replicateStableProfilesToRc(): Promise<ReplicateResult> {
    const stableDir = profilesDirFor('cpane');
    const rcDir = profilesDirFor('cpanext');
    await mkdir(rcDir, { recursive: true });

    const [stableProfiles, rcProfiles] = await Promise.all([
        listProfileFiles(stableDir),
        listProfileFiles(rcDir),
    ]);
    const rcByName = new Map(
        rcProfiles.map(profile => [profile.name, profile]),
    );

    await Promise.all(
        stableProfiles.map(async profile => {
            const destPath = join(rcDir, basename(profile.path));

            const existingRc = rcByName.get(profile.name);
            if (existingRc && existingRc.path !== destPath) {
                await rm(existingRc.path);
            }

            await copyFile(profile.path, destPath);
        }),
    );

    return { copiedOrUpdated: stableProfiles.map(profile => profile.name) };
}
