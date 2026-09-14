import spawn from 'cross-spawn';

/** Expand the remote-home shorthand used elsewhere in profile paths. */
export function resolveVscodeDirectory(
    directory: string,
    remoteHome: string,
): string {
    if (directory === '~') return remoteHome;
    if (directory.startsWith('~/')) {
        return `${remoteHome.replace(/\/$/, '')}/${directory.slice(2)}`;
    }
    return directory;
}

export function buildVscodeRemoteArgs(
    host: string,
    directory: string,
): string[] {
    return ['--remote', `ssh-remote+${host}`, directory];
}

/**
 * Launch the local VS Code client and let its Remote - SSH extension connect
 * to the profile's SSH alias. The detached process must outlive cPane's
 * foreground ssh/tmux session.
 */
export function launchVscodeRemote(
    host: string,
    directory: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn('code', buildVscodeRemoteArgs(host, directory), {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        });

        child.once('error', reject);
        child.once('spawn', () => {
            child.unref();
            resolve();
        });
    });
}
