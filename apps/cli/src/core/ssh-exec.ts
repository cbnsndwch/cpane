import { spawn } from 'node:child_process';

export interface SshExecResult {
    stdout: string;
    exitCode: number;
}

/** Runs a remote script non-interactively over `ssh`, capturing stdout. */
export function sshExec(
    host: string,
    remoteScript: string,
): Promise<SshExecResult> {
    return new Promise((resolve, reject) => {
        const child = spawn('ssh', [host, remoteScript], {
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        let stdout = '';
        child.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString('utf8');
        });
        child.on('error', reject);
        child.on('close', code => resolve({ stdout, exitCode: code ?? 1 }));
    });
}

/**
 * True when `sshExec` failed before the remote script produced any output at
 * all — e.g. DNS/connection/auth failure — as opposed to the remote script
 * itself exiting non-zero (our inspect script always prints a `$HOME` line
 * before anything that can legitimately fail, like `tmux has-session`). The
 * two cases need different messages: "couldn't reach the host" vs. "session
 * doesn't exist yet".
 */
export function isSshUnreachable(result: SshExecResult): boolean {
    return result.exitCode !== 0 && result.stdout.trim() === '';
}

/**
 * Runs a remote script interactively over `ssh -t`, inheriting the local
 * TTY. Resolves with the exit code once the ssh process (and whatever it
 * ran, e.g. a tmux attach) ends.
 */
export function sshInteractive(
    host: string,
    remoteScript: string,
): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn('ssh', ['-t', host, remoteScript], {
            stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('close', code => resolve(code ?? 1));
    });
}
