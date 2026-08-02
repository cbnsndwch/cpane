import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { CpaneContext } from '../core/config-dir.ts';
import { openInEditor } from '../core/editor.ts';
import { findProfilePath, writeProfileFile } from '../core/profile-loader.ts';
import type { Profile } from '../core/profile-schema.ts';
import { selectOrType } from '../core/prompt.ts';
import { readSshConfigHostAliases } from '../core/ssh-config.ts';

/** `cpane add <name>` — minimal scaffold, then hand off to $EDITOR/$VISUAL (PRD §6.4). */
export async function runAdd(
    context: CpaneContext,
    name: string | undefined,
): Promise<number> {
    if (!name) {
        console.error(`Usage: ${context.binaryName} add <name>`);
        return 1;
    }

    const existing = await findProfilePath(context.profilesDir, name);
    if (existing) {
        console.error(
            `A profile named "${name}" already exists at ${existing}.`,
        );
        return 1;
    }

    const aliases = await readSshConfigHostAliases();
    const host = await selectOrType(
        'Pick a host (from ~/.ssh/config):',
        aliases,
    );
    if (!host) {
        console.error('A host is required.');
        return 1;
    }

    const profile: Profile = { host, windows: [{ name: 'main' }] };

    await mkdir(context.profilesDir, { recursive: true });
    const filePath = join(context.profilesDir, `${name}.yaml`);
    await writeProfileFile(filePath, profile);
    console.log(`Created ${filePath}`);

    return openInEditor(filePath);
}
