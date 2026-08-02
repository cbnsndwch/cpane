import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { CpaneContext } from './config-dir.ts';
import { fetchLatestRelease } from './github-releases.ts';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;

export interface UpdateCache {
    lastChecked: number;
    latestKnownVersion: string;
}

async function readCache(cachePath: string): Promise<UpdateCache | undefined> {
    try {
        return JSON.parse(await readFile(cachePath, 'utf8')) as UpdateCache;
    } catch {
        return undefined;
    }
}

async function writeCache(
    cachePath: string,
    cache: UpdateCache,
): Promise<void> {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}

function parseVersion(version: string): {
    core: number[];
    pre?: [string, number];
} {
    const [core, pre] = version.split('-');
    const nums = (core ?? '').split('.').map(Number);
    if (!pre) return { core: nums };
    const match = /^([a-zA-Z]+)\.(\d+)$/.exec(pre);
    return {
        core: nums,
        pre: match ? [match[1]!, Number(match[2])] : [pre, 0],
    };
}

/** Good enough for our own `X.Y.Z` / `X.Y.Z-rc.N` tags — not general semver. */
export function isNewerVersion(candidate: string, current: string): boolean {
    const a = parseVersion(candidate);
    const b = parseVersion(current);

    for (let i = 0; i < Math.max(a.core.length, b.core.length); i++) {
        const diff = (a.core[i] ?? 0) - (b.core[i] ?? 0);
        if (diff !== 0) return diff > 0;
    }

    if (!a.pre && !b.pre) return false;
    if (!a.pre) return true;
    if (!b.pre) return false;
    if (a.pre[0] !== b.pre[0]) return a.pre[0] > b.pre[0];
    return a.pre[1] > b.pre[1];
}

async function refreshCache(
    context: CpaneContext,
    currentVersion: string,
): Promise<void> {
    const release = await fetchLatestRelease(context.channel, FETCH_TIMEOUT_MS);
    await writeCache(context.updateCachePath, {
        lastChecked: Date.now(),
        latestKnownVersion: release
            ? release.tag_name.replace(/^v/, '')
            : currentVersion,
    });
}

export interface UpdateNotice {
    message: string;
}

/**
 * Never awaited by callers for its refresh side effect — only the cheap
 * local cache read is on the critical path. Refresh happens over the
 * network in the background, at most once per ~24h (PRD §8.5).
 */
export async function checkForUpdate(
    context: CpaneContext,
    currentVersion: string,
): Promise<UpdateNotice | undefined> {
    const cache = await readCache(context.updateCachePath);
    const stale = !cache || Date.now() - cache.lastChecked > CHECK_INTERVAL_MS;

    if (stale) {
        void refreshCache(context, currentVersion).catch(() => {});
    }

    if (
        cache?.latestKnownVersion &&
        isNewerVersion(cache.latestKnownVersion, currentVersion)
    ) {
        return {
            message: `A newer ${context.binaryName} version is available: v${cache.latestKnownVersion} (you have v${currentVersion}). Run \`${context.binaryName} upgrade\` to update.`,
        };
    }
    return undefined;
}
