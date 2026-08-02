import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import { z } from 'zod';
import * as YAML from 'yaml';
import JSON5 from 'json5';
import * as TOML from 'smol-toml';
import { parse as parseJsonc } from 'jsonc-parser';

import { parseProfile, type Profile } from './profile-schema.ts';

export type ProfileFormat = 'yaml' | 'json' | 'jsonc' | 'json5' | 'toml';

const EXTENSION_FORMATS: Record<string, ProfileFormat> = {
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.json': 'json',
    '.jsonc': 'jsonc',
    '.json5': 'json5',
    '.toml': 'toml',
};

export const PROFILE_EXTENSIONS = Object.keys(EXTENSION_FORMATS);

export class ProfileFormatError extends Error {}

export class ProfileValidationError extends Error {
    constructor(
        public readonly filePath: string,
        public readonly zodError: z.ZodError,
    ) {
        const detail = zodError.issues
            .map(
                issue =>
                    `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
            )
            .join('\n');
        super(`Invalid profile "${filePath}":\n${detail}`);
    }
}

export function detectFormat(filePath: string): ProfileFormat {
    const dot = filePath.lastIndexOf('.');
    const ext = dot === -1 ? '' : filePath.slice(dot).toLowerCase();
    const format = EXTENSION_FORMATS[ext];
    if (!format) {
        throw new ProfileFormatError(
            `Unrecognized profile file extension "${ext}" in "${filePath}". Expected one of: ${PROFILE_EXTENSIONS.join(', ')}`,
        );
    }
    return format;
}

export function parseProfileText(text: string, format: ProfileFormat): unknown {
    switch (format) {
        case 'yaml':
            return YAML.parse(text);
        case 'json':
            return JSON.parse(text);
        case 'jsonc': {
            const errors: import('jsonc-parser').ParseError[] = [];
            const value = parseJsonc(text, errors, {
                allowTrailingComma: true,
                disallowComments: false,
            });
            if (errors.length > 0) {
                throw new ProfileFormatError(
                    `Failed to parse JSONC: ${errors.map(e => `offset ${e.offset}: error code ${e.error}`).join('; ')}`,
                );
            }
            return value;
        }
        case 'json5':
            return JSON5.parse(text);
        case 'toml':
            return TOML.parse(text);
    }
}

export function stringifyProfile(
    profile: Profile,
    format: ProfileFormat,
): string {
    switch (format) {
        case 'yaml':
            return YAML.stringify(profile);
        case 'json':
            return `${JSON.stringify(profile, null, 2)}\n`;
        case 'jsonc':
            return `${JSON.stringify(profile, null, 2)}\n`;
        case 'json5':
            return `${JSON5.stringify(profile, null, 2)}\n`;
        case 'toml':
            return TOML.stringify(profile);
    }
}

export async function loadProfileFile(filePath: string): Promise<Profile> {
    const format = detectFormat(filePath);
    const text = await readFile(filePath, 'utf8');
    const data = parseProfileText(text, format);
    try {
        return parseProfile(data);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new ProfileValidationError(filePath, error);
        }
        throw error;
    }
}

export async function writeProfileFile(
    filePath: string,
    profile: Profile,
): Promise<void> {
    const format = detectFormat(filePath);
    await writeFile(filePath, stringifyProfile(profile, format), 'utf8');
}

export interface ProfileFileRef {
    name: string;
    path: string;
    format: ProfileFormat;
}

/** Static, instant listing of profile files — no network calls (PRD §6.4). */
export async function listProfileFiles(
    profilesDir: string,
): Promise<ProfileFileRef[]> {
    let entries: string[];
    try {
        entries = await readdir(profilesDir);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }

    const refs: ProfileFileRef[] = [];
    for (const entry of entries) {
        const ext = extname(entry).toLowerCase();
        const format = EXTENSION_FORMATS[ext];
        if (!format) continue;
        refs.push({
            name: basename(entry, extname(entry)),
            path: join(profilesDir, entry),
            format,
        });
    }
    return refs.toSorted((a, b) => a.name.localeCompare(b.name));
}

export async function findProfilePath(
    profilesDir: string,
    name: string,
): Promise<string | undefined> {
    const refs = await listProfileFiles(profilesDir);
    return refs.find(ref => ref.name === name)?.path;
}
