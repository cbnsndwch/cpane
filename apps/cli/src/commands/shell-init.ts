import type { CpaneContext } from '../core/config-dir.ts';
import { listProfileFiles } from '../core/profile-loader.ts';
import {
    generateShellInit,
    SHELL_KINDS,
    type ShellKind,
} from '../core/shell-init.ts';

function isShellKind(value: string): value is ShellKind {
    return (SHELL_KINDS as string[]).includes(value);
}

export async function runShellInit(
    context: CpaneContext,
    shellArg: string | undefined,
): Promise<number> {
    const shell = shellArg?.toLowerCase();
    if (!shell || !isShellKind(shell)) {
        console.error(
            `Usage: ${context.binaryName} shell-init <${SHELL_KINDS.join('|')}>`,
        );
        return 1;
    }

    const profiles = await listProfileFiles(context.profilesDir);
    const { script, skipped } = generateShellInit(
        shell,
        context.binaryName,
        profiles.map(profile => profile.name),
    );

    if (skipped.length > 0) {
        console.error(
            `Skipped profile(s) that can't safely become a shell function: ${skipped.join(', ')}`,
        );
    }

    // stdout is meant to be eval'd directly — nothing but the script goes here.
    console.log(script);
    return 0;
}
