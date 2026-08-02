import type { CpaneContext } from '../core/config-dir.ts';
import {
    findProfilePath,
    loadProfileFile,
    ProfileValidationError,
} from '../core/profile-loader.ts';
import { confirm } from '../core/prompt.ts';
import { isSshUnreachable, sshExec, sshInteractive } from '../core/ssh-exec.ts';
import {
    buildAttachCommand,
    buildBootstrapCommands,
    buildGapCommands,
    buildInspectScript,
    describeGap,
    diffLayout,
    joinRemoteScript,
    parseInspectOutput,
} from '../core/tmux.ts';

export async function runConnect(
    context: CpaneContext,
    profileName: string,
): Promise<number> {
    const filePath = await findProfilePath(context.profilesDir, profileName);
    if (!filePath) {
        console.error(
            `No profile named "${profileName}" in ${context.profilesDir}.`,
        );
        console.error(
            `Run \`${context.binaryName} list\` to see available profiles, or \`${context.binaryName} add ${profileName}\` to create it.`,
        );
        return 1;
    }

    let profile;
    try {
        profile = await loadProfileFile(filePath);
    } catch (error) {
        console.error(
            error instanceof ProfileValidationError
                ? error.message
                : String(error),
        );
        return 1;
    }

    // The profile name IS the tmux session name (1:1) — PRD §6.1.
    const session = profileName;

    const inspect = await sshExec(profile.host, buildInspectScript(session));
    if (isSshUnreachable(inspect)) {
        console.error(`Could not reach "${profile.host}" over ssh.`);
        return 1;
    }
    const live = parseInspectOutput(inspect.stdout, inspect.exitCode);

    let script: string;
    if (!live.exists) {
        script = joinRemoteScript([
            ...buildBootstrapCommands(session, profile),
            buildAttachCommand(session),
        ]);
    } else {
        const gaps = diffLayout(profile, live.windows);
        if (gaps.length === 0) {
            script = buildAttachCommand(session);
        } else {
            console.log(`Session "${session}" is missing:`);
            for (const gap of gaps) console.log(`  - ${describeGap(gap)}`);
            const shouldFill = await confirm(
                'Launch the missing windows/panes before attaching?',
                false,
            );
            script = joinRemoteScript([
                ...(shouldFill ? buildGapCommands(session, gaps) : []),
                buildAttachCommand(session),
            ]);
        }
    }

    return sshInteractive(profile.host, script);
}
