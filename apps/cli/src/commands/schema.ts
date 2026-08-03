import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CpaneContext } from '../core/config-dir.ts';
import { buildProfileJsonSchema } from '../core/profile-json-schema.ts';

/**
 * Writes the profile JSON Schema into this binary's own config dir, for
 * pointing an editor's JSON/YAML language server at it (see README) — a
 * local file rather than a remote URL so it always matches the exact
 * validation rules of the cpane build that generated it, and works offline.
 */
export async function runSchema(context: CpaneContext): Promise<number> {
    await mkdir(context.configDir, { recursive: true });
    const outPath = join(context.configDir, 'profile.schema.json');
    await writeFile(
        outPath,
        `${JSON.stringify(buildProfileJsonSchema(), null, 2)}\n`,
        'utf8',
    );
    console.log(outPath);
    return 0;
}
