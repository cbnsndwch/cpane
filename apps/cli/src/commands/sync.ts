import type { CpaneContext } from '../core/config-dir.ts';
import {
    findProfilePath,
    loadProfileFile,
    writeProfileFile,
} from '../core/profile-loader.ts';
import { isSshUnreachable, sshExec } from '../core/ssh-exec.ts';
import {
    buildInspectScript,
    captureProfileFromLive,
    parseInspectOutput,
} from '../core/tmux.ts';

export async function runSync(
    context: CpaneContext,
    name: string | undefined,
): Promise<number> {
    if (!name) {
        console.error(`Usage: ${context.binaryName} sync <profile>`);
        return 1;
    }

    const filePath = await findProfilePath(context.profilesDir, name);
    if (!filePath) {
        console.error(`No profile named "${name}" in ${context.profilesDir}.`);
        return 1;
    }

    const profile = await loadProfileFile(filePath);
    const inspect = await sshExec(profile.host, buildInspectScript(name));

    if (isSshUnreachable(inspect)) {
        console.error(`Could not reach "${profile.host}" over ssh.`);
        return 1;
    }

    const live = parseInspectOutput(inspect.stdout, inspect.exitCode);

    if (!live.exists) {
        console.error(
            `Session "${name}" isn't running on "${profile.host}" — nothing to sync.`,
        );
        return 1;
    }

    const captured = captureProfileFromLive(
        profile.host,
        live.windows,
        live.home,
    );
    await writeProfileFile(filePath, captured);

    const windowCount = captured.windows.length;
    console.log(
        `Synced ${filePath} from the live "${name}" session (${windowCount} window${windowCount === 1 ? '' : 's'}).`,
    );
    return 0;
}
