import { createCliRenderer } from '@opentui/core';
import { createRoot, useKeyboard } from '@opentui/react';
import { useMemo, useState } from 'react';

import { runConnect } from './connect.ts';
import type { CpaneContext } from '../core/config-dir.ts';
import { fuzzyFilter } from '../core/fuzzy.ts';
import {
    listProfileFiles,
    type ProfileFileRef,
} from '../core/profile-loader.ts';
import { isInteractiveTty } from '../core/tty.ts';

interface PickerProps {
    profiles: ProfileFileRef[];
    onDone: (selected: string | undefined) => void;
}

function Picker({ profiles, onDone }: PickerProps) {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    const filtered = useMemo(
        () => fuzzyFilter(query, profiles, profile => profile.name),
        [query, profiles],
    );
    const clampedIndex =
        filtered.length === 0
            ? 0
            : Math.min(selectedIndex, filtered.length - 1);

    useKeyboard(key => {
        if (key.name === 'up') setSelectedIndex(i => Math.max(0, i - 1));
        else if (key.name === 'down')
            setSelectedIndex(i => Math.min(filtered.length - 1, i + 1));
        else if (key.name === 'escape') onDone(undefined);
    });

    return (
        <box
            title="cpane — connect"
            style={{ flexDirection: 'column', border: true, padding: 1 }}
        >
            <input
                placeholder="Fuzzy search profiles..."
                focused
                onInput={value => {
                    setQuery(value);
                    setSelectedIndex(0);
                }}
                onSubmit={() => onDone(filtered[clampedIndex]?.name)}
            />
            <box style={{ flexDirection: 'column', marginTop: 1 }}>
                {filtered.length === 0 ? (
                    <text fg="gray">No matching profiles.</text>
                ) : (
                    filtered.map((profile, index) => (
                        <text
                            key={profile.name}
                            fg={index === clampedIndex ? 'black' : undefined}
                            bg={index === clampedIndex ? 'cyan' : undefined}
                        >
                            {index === clampedIndex ? '> ' : '  '}
                            {profile.name}
                        </text>
                    ))
                )}
            </box>
            <text fg="gray">↑/↓ move · enter connect · esc cancel</text>
        </box>
    );
}

export async function runPicker(context: CpaneContext): Promise<number> {
    const profiles = await listProfileFiles(context.profilesDir);
    if (profiles.length === 0) {
        console.log(
            `No profiles yet. Create one with \`${context.binaryName} add <name>\`.`,
        );
        return 0;
    }

    if (!isInteractiveTty()) {
        console.error(
            `${context.binaryName} needs an interactive terminal to show the picker. Run \`${context.binaryName} list\` or \`${context.binaryName} <profile>\` instead.`,
        );
        return 1;
    }

    const renderer = await createCliRenderer({ exitOnCtrlC: true });
    const selected = await new Promise<string | undefined>(resolve => {
        createRoot(renderer).render(
            <Picker profiles={profiles} onDone={resolve} />,
        );
    });
    renderer.destroy();

    if (!selected) return 0;
    return runConnect(context, selected);
}
