import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOST_LINE = /^host\s+(.+)$/i;

/**
 * Extracts `Host` aliases from raw `~/.ssh/config` text.
 *
 * Deliberately dumb: only matches lines whose first token is the literal
 * keyword `Host`, and only reads the alias tokens on that line. It never
 * looks at `HostName`/`User`/`Port`/`IdentityFile`/etc, and does not resolve
 * `Include`, `Match`, or wildcard patterns — see PRD §6.5. Wildcard aliases
 * (containing `*` or `?`) are dropped since they aren't concrete hosts.
 */
export function parseSshConfigHosts(text: string): string[] {
    const aliases = new Set<string>();

    for (const rawLine of text.split(/\r?\n/)) {
        const line = stripComment(rawLine).trim();
        if (!line) continue;

        const match = HOST_LINE.exec(line);
        if (!match) continue;

        for (const token of match[1].trim().split(/\s+/)) {
            if (!token || token.includes('*') || token.includes('?')) continue;
            aliases.add(token);
        }
    }

    return [...aliases].toSorted((a, b) => a.localeCompare(b));
}

function stripComment(line: string): string {
    // A `#` starts a comment when it's at line-start or preceded by
    // whitespace; anything before it survives.
    const match = /(^|\s)#.*$/.exec(line);
    return match ? line.slice(0, match.index) : line;
}

export function defaultSshConfigPath(): string {
    return join(homedir(), '.ssh', 'config');
}

/**
 * Reads `Host` aliases from `~/.ssh/config` (or `configPath`). Missing file
 * is a soft failure — an empty list — since the ssh-alias pick-list is a UX
 * convenience, not a hard dependency (PRD §6.5).
 */
export async function readSshConfigHostAliases(
    configPath = defaultSshConfigPath(),
): Promise<string[]> {
    let text: string;
    try {
        text = await readFile(configPath, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
    return parseSshConfigHosts(text);
}
