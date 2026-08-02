import { chmod, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BinaryName, CpaneContext } from '../core/config-dir.ts';
import { fetchLatestRelease } from '../core/github-releases.ts';
import { isNewerVersion } from '../core/update-check.ts';

const UPGRADE_FETCH_TIMEOUT_MS = 10_000;

function platformAssetName(binaryName: BinaryName): string | undefined {
    const arch =
        process.arch === 'arm64'
            ? 'arm64'
            : process.arch === 'x64'
              ? 'x64'
              : undefined;
    if (!arch) return undefined;

    // Matches CI's release-asset naming (windows-x64, linux-x64, linux-arm64
    // — no macOS build per PRD §4/§8.2).
    if (process.platform === 'win32')
        return arch === 'x64' ? `${binaryName}-windows-x64.exe` : undefined;
    if (process.platform === 'linux') return `${binaryName}-linux-${arch}`;
    return undefined;
}

/**
 * Renaming (rather than overwriting) the running executable's file works on
 * both POSIX and Windows, even though deleting or overwriting it in place
 * while it's running does not work on Windows (the OS keeps the open handle
 * valid under the old name). The final cleanup of the `.old` file is
 * best-effort: on Windows it's still held open by this very process and
 * will fail to delete — that's fine, it's cleaned up by the next upgrade's
 * leading cleanup step.
 */
async function replaceRunningBinary(newBinaryPath: string): Promise<void> {
    const currentPath = process.execPath;
    const backupPath = `${currentPath}.old`;

    await rm(backupPath, { force: true }).catch(() => {});
    await rename(currentPath, backupPath);
    await rename(newBinaryPath, currentPath);
    await rm(backupPath, { force: true }).catch(() => {});
}

export async function runUpgrade(
    context: CpaneContext,
    currentVersion: string,
): Promise<number> {
    console.log(`Checking for the latest ${context.binaryName} release...`);

    const release = await fetchLatestRelease(
        context.channel,
        UPGRADE_FETCH_TIMEOUT_MS,
    );
    if (!release) {
        console.error('Could not reach GitHub to check for updates.');
        return 1;
    }

    const latestVersion = release.tag_name.replace(/^v/, '');
    if (!isNewerVersion(latestVersion, currentVersion)) {
        console.log(`Already up to date (v${currentVersion}).`);
        return 0;
    }

    const assetName = platformAssetName(context.binaryName);
    const asset = assetName
        ? release.assets.find(a => a.name === assetName)
        : undefined;
    if (!asset) {
        console.error(
            `No release asset for this platform (${process.platform}/${process.arch}) in ${release.tag_name}.`,
        );
        return 1;
    }

    console.log(`Downloading ${release.tag_name}...`);
    const response = await fetch(asset.browser_download_url);
    if (!response.ok) {
        console.error(`Download failed: HTTP ${response.status}`);
        return 1;
    }
    const buffer = new Uint8Array(await response.arrayBuffer());

    const downloadPath = join(
        tmpdir(),
        `${context.binaryName}-${latestVersion}${process.platform === 'win32' ? '.exe' : ''}`,
    );
    await writeFile(downloadPath, buffer, { mode: 0o755 });
    await chmod(downloadPath, 0o755).catch(() => {});

    await replaceRunningBinary(downloadPath);

    console.log(`Upgraded ${context.binaryName} to ${release.tag_name}.`);
    return 0;
}
