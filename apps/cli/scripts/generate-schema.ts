#!/usr/bin/env bun
import { writeFile } from 'node:fs/promises';

import { buildProfileJsonSchema } from '../src/core/profile-json-schema.ts';

const outPath = new URL('../schema/profile.schema.json', import.meta.url);
await writeFile(
    outPath,
    `${JSON.stringify(buildProfileJsonSchema(), null, 2)}\n`,
);
console.log(`Wrote ${outPath.pathname}`);
