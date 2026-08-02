import type { CpaneContext } from '../core/config-dir.ts';
import { openInEditor } from '../core/editor.ts';
import { findProfilePath } from '../core/profile-loader.ts';

export async function runEdit(
    context: CpaneContext,
    name: string | undefined,
): Promise<number> {
    if (!name) {
        console.error(`Usage: ${context.binaryName} edit <name>`);
        return 1;
    }

    const filePath = await findProfilePath(context.profilesDir, name);
    if (!filePath) {
        console.error(`No profile named "${name}" in ${context.profilesDir}.`);
        return 1;
    }

    return openInEditor(filePath);
}
