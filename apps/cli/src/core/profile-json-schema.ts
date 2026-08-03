import { z } from 'zod';

import { profileSchema } from './profile-schema.ts';

/**
 * JSON Schema for profile files, for editor autocomplete/validation (`cpane
 * schema`). draft-07 for broad IDE support (VS Code's built-in JSON
 * language service and the redhat.vscode-yaml extension both handle it
 * well; 2020-12 support is patchier).
 *
 * Structural only — can't express the Zod schema's `.refine()` rules
 * (command/panes mutual exclusivity, unique window names), since JSON
 * Schema has no equivalent of an arbitrary predicate function. Those are
 * still only enforced by cpane itself at load time; this is IDE assist, not
 * a validator replacement.
 */
export function buildProfileJsonSchema(): Record<string, unknown> {
    const jsonSchema = z.toJSONSchema(profileSchema, { target: 'draft-07' });

    return {
        $schema: jsonSchema.$schema,
        $id: 'https://raw.githubusercontent.com/cbnsndwch/cpane/main/apps/cli/schema/profile.schema.json',
        title: 'cPane profile',
        description:
            'A declarative tmux session profile for cPane (https://github.com/cbnsndwch/cpane). Structural validation only — command/panes mutual exclusivity and unique window names are enforced by cpane itself, not representable in JSON Schema.',
        ...jsonSchema,
    };
}
