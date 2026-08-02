import { spawn } from 'node:child_process';

/** Opens `filePath` in `$VISUAL`/`$EDITOR`; a no-op notice if neither is set. */
export function openInEditor(filePath: string): Promise<number> {
    const editorCommand = process.env.VISUAL || process.env.EDITOR;
    if (!editorCommand) {
        console.log(
            `Set $EDITOR or $VISUAL to have this open automatically: ${filePath}`,
        );
        return Promise.resolve(0);
    }

    const [editor, ...editorArgs] = editorCommand.trim().split(/\s+/);
    return new Promise((resolve, reject) => {
        const child = spawn(editor!, [...editorArgs, filePath], {
            stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('close', code => resolve(code ?? 0));
    });
}
