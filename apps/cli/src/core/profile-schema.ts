import { z } from 'zod';

export const paneSchema = z
    .object({
        cwd: z.string().min(1).optional(),
        command: z.string().min(1).optional(),
        split: z.enum(['horizontal', 'vertical']),
        size: z.string().min(1).optional(),
    })
    .strict();

export const windowSchema = z
    .object({
        name: z.string().min(1),
        cwd: z.string().min(1).optional(),
        command: z.string().min(1).optional(),
        panes: z.array(paneSchema).min(1).optional(),
    })
    .strict()
    .refine(
        window => !(window.command !== undefined && window.panes !== undefined),
        {
            message: '`command` and `panes` are mutually exclusive on a window',
            path: ['panes'],
        },
    );

export const profileSchema = z
    .object({
        host: z.string().min(1),
        windows: z.array(windowSchema).min(1),
    })
    .strict()
    .refine(
        profile =>
            new Set(profile.windows.map(window => window.name)).size ===
            profile.windows.length,
        {
            message: 'window names must be unique within a profile',
            path: ['windows'],
        },
    );

export type Pane = z.infer<typeof paneSchema>;
export type Window = z.infer<typeof windowSchema>;
export type Profile = z.infer<typeof profileSchema>;

export function parseProfile(data: unknown): Profile {
    return profileSchema.parse(data);
}
