import type { Channel } from './config-dir.ts';

const REPO = 'cbnsndwch/cpane';

export interface GithubReleaseAsset {
    name: string;
    browser_download_url: string;
}

export interface GithubRelease {
    tag_name: string;
    assets: GithubReleaseAsset[];
}

function releaseEndpointFor(channel: Channel): string {
    // Stable ships GitHub (non-pre) releases; rc ships prereleases, so the
    // single "latest" endpoint (which ignores prereleases) doesn't apply —
    // take the newest release/prerelease overall instead.
    return channel === 'stable'
        ? `https://api.github.com/repos/${REPO}/releases/latest`
        : `https://api.github.com/repos/${REPO}/releases?per_page=1`;
}

export async function fetchLatestRelease(
    channel: Channel,
    timeoutMs: number,
): Promise<GithubRelease | undefined> {
    const response = await fetch(releaseEndpointFor(channel), {
        headers: { accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return undefined;

    const data = (await response.json()) as GithubRelease | GithubRelease[];
    const release = Array.isArray(data) ? data[0] : data;
    return release?.tag_name ? release : undefined;
}
