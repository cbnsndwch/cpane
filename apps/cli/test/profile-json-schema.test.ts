import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { buildProfileJsonSchema } from '../src/core/profile-json-schema.ts';

describe('buildProfileJsonSchema', () => {
    it('matches the committed schema/profile.schema.json exactly', async () => {
        const committed = JSON.parse(
            await readFile(
                new URL('../schema/profile.schema.json', import.meta.url),
                'utf8',
            ),
        );
        expect(buildProfileJsonSchema()).toEqual(committed);
    });

    it('marks host and windows as required, disallowing unknown top-level keys', () => {
        const schema = buildProfileJsonSchema() as Record<string, unknown>;
        expect(schema.required).toEqual(['host', 'windows']);
        expect(schema.additionalProperties).toBe(false);
    });

    it("requires split on every pane and forbids panes' unknown keys", () => {
        const schema = buildProfileJsonSchema() as any;
        const paneSchema =
            schema.properties.windows.items.properties.panes.items;
        expect(paneSchema.required).toEqual(['split']);
        expect(paneSchema.properties.split.enum).toEqual([
            'horizontal',
            'vertical',
        ]);
        expect(paneSchema.additionalProperties).toBe(false);
    });
});
