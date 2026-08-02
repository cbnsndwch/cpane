import { homedir } from 'node:os';
import { join } from 'node:path';

export type Channel = 'stable' | 'rc';
export type BinaryName = 'cpane' | 'cpanext';

export interface ChannelInfo {
    channel: Channel;
    binaryName: BinaryName;
}

/**
 * Determines which channel is running: `cpane` (stable) or `cpanext` (rc).
 * Two isolated binaries, never a config toggle (PRD §8.1). Detected from the
 * running executable's own name; `CPANE_CHANNEL` overrides for local dev,
 * since `bun run src/index.ts` doesn't produce a `cpane`/`cpanext`-named
 * process to sniff.
 */
export function resolveChannel(
    execPath: string = process.execPath,
): ChannelInfo {
    const override = process.env.CPANE_CHANNEL;
    if (override === 'rc') return { channel: 'rc', binaryName: 'cpanext' };
    if (override === 'stable')
        return { channel: 'stable', binaryName: 'cpane' };

    // Split on both separators rather than `path.basename` (which follows
    // the *host* platform's convention) so a Windows-style path is read
    // correctly even under test on a non-Windows runner.
    const execName = (execPath.split(/[/\\]/).pop() ?? '')
        .replace(/\.exe$/i, '')
        .toLowerCase();
    if (execName === 'cpanext') return { channel: 'rc', binaryName: 'cpanext' };
    return { channel: 'stable', binaryName: 'cpane' };
}

export function configDirFor(binaryName: BinaryName): string {
    return join(homedir(), '.config', binaryName);
}

export function profilesDirFor(binaryName: BinaryName): string {
    return join(configDirFor(binaryName), 'profiles');
}

export interface CpaneContext extends ChannelInfo {
    configDir: string;
    profilesDir: string;
    updateCachePath: string;
}

export function resolveContext(
    execPath: string = process.execPath,
): CpaneContext {
    const { channel, binaryName } = resolveChannel(execPath);
    const configDir = configDirFor(binaryName);
    return {
        channel,
        binaryName,
        configDir,
        profilesDir: profilesDirFor(binaryName),
        updateCachePath: join(configDir, 'update-cache.json'),
    };
}
