import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { SelectOption } from '@opentui/core';
import { createCliRenderer } from '@opentui/core';
import { createRoot, useKeyboard } from '@opentui/react';
import { useState } from 'react';

import type { CpaneContext } from '../core/config-dir.ts';
import { listProfileFiles, writeProfileFile } from '../core/profile-loader.ts';
import type { Pane, Profile, Window } from '../core/profile-schema.ts';
import { readSshConfigHostAliases } from '../core/ssh-config.ts';
import { isInteractiveTty } from '../core/tty.ts';

const TYPE_HOST_MANUALLY = '__cpane_type_manually__';

interface DraftPane {
    cwd: string;
    command: string;
    split: 'horizontal' | 'vertical';
    size: string;
}

interface DraftWindow {
    name: string;
    cwd: string;
    command: string;
    panes: DraftPane[];
}

const emptyPane = (): DraftPane => ({
    cwd: '',
    command: '',
    split: 'horizontal',
    size: '',
});
const emptyWindow = (): DraftWindow => ({
    name: '',
    cwd: '',
    command: '',
    panes: [],
});

function draftToWindow(draft: DraftWindow): Window {
    if (draft.panes.length > 0) {
        const panes: Pane[] = draft.panes.map((pane, index) => ({
            cwd: pane.cwd || undefined,
            command: pane.command || undefined,
            // Pane 0 has nothing to split from — the value is a required
            // placeholder (see core/tmux.ts's capture logic for the same rule).
            split: index === 0 ? 'horizontal' : pane.split,
            size: pane.size || undefined,
        }));
        return { name: draft.name, panes };
    }

    const cwd = draft.cwd || undefined;
    const command = draft.command || undefined;
    return {
        name: draft.name,
        ...(cwd ? { cwd } : {}),
        ...(command ? { command } : {}),
    };
}

type Phase =
    | { kind: 'host-select' }
    | { kind: 'host-type' }
    | { kind: 'name' }
    | { kind: 'window-name' }
    | { kind: 'window-cwd' }
    | { kind: 'window-mode' }
    | { kind: 'window-command' }
    | { kind: 'pane-cwd' }
    | { kind: 'pane-command' }
    | { kind: 'pane-split' }
    | { kind: 'pane-size' }
    | { kind: 'add-pane' }
    | { kind: 'add-window' };

function TextPrompt({
    label,
    placeholder,
    onSubmit,
}: {
    label: string;
    placeholder?: string;
    onSubmit: (value: string) => void;
}) {
    const [value, setValue] = useState('');
    return (
        <box style={{ flexDirection: 'column' }}>
            <text>{label}</text>
            <input
                placeholder={placeholder}
                focused
                onInput={setValue}
                onSubmit={() => onSubmit(value.trim())}
            />
        </box>
    );
}

function ChoicePrompt({
    label,
    options,
    onSubmit,
}: {
    label: string;
    options: SelectOption[];
    onSubmit: (value: string) => void;
}) {
    return (
        <box style={{ flexDirection: 'column' }}>
            <text>{label}</text>
            <select
                focused
                options={options}
                style={{ height: Math.min(options.length + 2, 10) }}
                onChange={(_, option) => {
                    if (option) onSubmit(String(option.value));
                }}
            />
        </box>
    );
}

const YES_NO_OPTIONS: SelectOption[] = [
    { name: 'Yes', description: '', value: 'yes' },
    { name: 'No', description: '', value: 'no' },
];

interface WizardProps {
    hostAliases: string[];
    existingNames: Set<string>;
    onDone: (result: { name: string; profile: Profile } | undefined) => void;
}

function Wizard({ hostAliases, existingNames, onDone }: WizardProps) {
    const [phase, setPhase] = useState<Phase>(
        hostAliases.length > 0
            ? { kind: 'host-select' }
            : { kind: 'host-type' },
    );
    const [host, setHost] = useState('');
    const [name, setName] = useState('');
    const [nameError, setNameError] = useState<string | undefined>();
    const [windows, setWindows] = useState<DraftWindow[]>([]);
    const [currentWindow, setCurrentWindow] =
        useState<DraftWindow>(emptyWindow());
    const [currentPane, setCurrentPane] = useState<DraftPane>(emptyPane());

    useKeyboard(key => {
        if (key.name === 'escape') onDone(undefined);
    });

    switch (phase.kind) {
        case 'host-select':
            return (
                <ChoicePrompt
                    label="Pick a host (from ~/.ssh/config):"
                    options={[
                        ...hostAliases.map(alias => ({
                            name: alias,
                            description: '',
                            value: alias,
                        })),
                        {
                            name: 'Type manually...',
                            description: '',
                            value: TYPE_HOST_MANUALLY,
                        },
                    ]}
                    onSubmit={value => {
                        if (value === TYPE_HOST_MANUALLY)
                            setPhase({ kind: 'host-type' });
                        else {
                            setHost(value);
                            setPhase({ kind: 'name' });
                        }
                    }}
                />
            );

        case 'host-type':
            return (
                <TextPrompt
                    label="Host (ssh alias):"
                    onSubmit={value => {
                        if (!value) return;
                        setHost(value);
                        setPhase({ kind: 'name' });
                    }}
                />
            );

        case 'name':
            return (
                <box style={{ flexDirection: 'column' }}>
                    <TextPrompt
                        label="Profile name:"
                        onSubmit={value => {
                            if (!value) return;
                            if (existingNames.has(value)) {
                                setNameError(
                                    `A profile named "${value}" already exists.`,
                                );
                                return;
                            }
                            setName(value);
                            setPhase({ kind: 'window-name' });
                        }}
                    />
                    {nameError ? <text fg="red">{nameError}</text> : null}
                </box>
            );

        case 'window-name':
            return (
                <TextPrompt
                    label={`Window ${windows.length + 1} name:`}
                    onSubmit={value => {
                        if (!value) return;
                        setCurrentWindow({ ...emptyWindow(), name: value });
                        setPhase({ kind: 'window-cwd' });
                    }}
                />
            );

        case 'window-cwd':
            return (
                <TextPrompt
                    label="Working directory (blank = none):"
                    onSubmit={value => {
                        setCurrentWindow(w => ({ ...w, cwd: value }));
                        setPhase({ kind: 'window-mode' });
                    }}
                />
            );

        case 'window-mode':
            return (
                <ChoicePrompt
                    label="Single startup command, or split into panes?"
                    options={[
                        {
                            name: 'Single command (or none)',
                            description: '',
                            value: 'simple',
                        },
                        {
                            name: 'Split into panes',
                            description: '',
                            value: 'split',
                        },
                    ]}
                    onSubmit={value => {
                        if (value === 'split') {
                            setCurrentPane(emptyPane());
                            setPhase({ kind: 'pane-cwd' });
                        } else {
                            setPhase({ kind: 'window-command' });
                        }
                    }}
                />
            );

        case 'window-command':
            return (
                <TextPrompt
                    label="Startup command (blank = none):"
                    onSubmit={value => {
                        setWindows(ws => [
                            ...ws,
                            { ...currentWindow, command: value },
                        ]);
                        setPhase({ kind: 'add-window' });
                    }}
                />
            );

        case 'pane-cwd':
            return (
                <TextPrompt
                    label={`Pane ${currentWindow.panes.length + 1} working directory (blank = window's):`}
                    onSubmit={value => {
                        setCurrentPane(p => ({ ...p, cwd: value }));
                        setPhase({ kind: 'pane-command' });
                    }}
                />
            );

        case 'pane-command':
            return (
                <TextPrompt
                    label="Pane command (blank = none):"
                    onSubmit={value => {
                        setCurrentPane(p => ({ ...p, command: value }));
                        // Pane 0 has nothing to split from, so direction is moot.
                        setPhase(
                            currentWindow.panes.length === 0
                                ? { kind: 'pane-size' }
                                : { kind: 'pane-split' },
                        );
                    }}
                />
            );

        case 'pane-split':
            return (
                <ChoicePrompt
                    label="Split direction (relative to the previous pane):"
                    options={[
                        {
                            name: 'Horizontal (side by side)',
                            description: '',
                            value: 'horizontal',
                        },
                        {
                            name: 'Vertical (stacked)',
                            description: '',
                            value: 'vertical',
                        },
                    ]}
                    onSubmit={value => {
                        setCurrentPane(p => ({
                            ...p,
                            split:
                                value === 'vertical'
                                    ? 'vertical'
                                    : 'horizontal',
                        }));
                        setPhase({ kind: 'pane-size' });
                    }}
                />
            );

        case 'pane-size':
            return (
                <TextPrompt
                    label="Pane size, e.g. 30% (blank = tmux's default even split):"
                    onSubmit={value => {
                        setCurrentWindow(w => ({
                            ...w,
                            panes: [
                                ...w.panes,
                                { ...currentPane, size: value },
                            ],
                        }));
                        setPhase({ kind: 'add-pane' });
                    }}
                />
            );

        case 'add-pane':
            return (
                <ChoicePrompt
                    label="Add another pane to this window?"
                    options={YES_NO_OPTIONS}
                    onSubmit={value => {
                        if (value === 'yes') {
                            setCurrentPane(emptyPane());
                            setPhase({ kind: 'pane-cwd' });
                        } else {
                            setWindows(ws => [...ws, currentWindow]);
                            setPhase({ kind: 'add-window' });
                        }
                    }}
                />
            );

        case 'add-window':
            return (
                <ChoicePrompt
                    label="Add another window?"
                    options={[
                        { name: 'Yes', description: '', value: 'yes' },
                        { name: 'No, finish', description: '', value: 'no' },
                    ]}
                    onSubmit={value => {
                        if (value === 'yes') {
                            setCurrentWindow(emptyWindow());
                            setPhase({ kind: 'window-name' });
                        } else {
                            onDone({
                                name,
                                profile: {
                                    host,
                                    windows: windows.map(draftToWindow),
                                },
                            });
                        }
                    }}
                />
            );

        default:
            return null;
    }
}

/** `cpane add --wizard` — guided flow, no hand-written YAML required (PRD §6.4). */
export async function runWizard(context: CpaneContext): Promise<number> {
    if (!isInteractiveTty()) {
        console.error(
            `${context.binaryName} add --wizard needs an interactive terminal. Run \`${context.binaryName} add <name>\` instead.`,
        );
        return 1;
    }

    const [aliases, existingProfiles] = await Promise.all([
        readSshConfigHostAliases(),
        listProfileFiles(context.profilesDir),
    ]);
    const existingNames = new Set(
        existingProfiles.map(profile => profile.name),
    );

    const renderer = await createCliRenderer({ exitOnCtrlC: true });
    const result = await new Promise<
        { name: string; profile: Profile } | undefined
    >(resolve => {
        createRoot(renderer).render(
            <Wizard
                hostAliases={aliases}
                existingNames={existingNames}
                onDone={resolve}
            />,
        );
    });
    renderer.destroy();

    if (!result) {
        console.log('Cancelled.');
        return 0;
    }

    await mkdir(context.profilesDir, { recursive: true });
    const filePath = join(context.profilesDir, `${result.name}.yaml`);
    await writeProfileFile(filePath, result.profile);
    console.log(`Created ${filePath}`);
    return 0;
}
