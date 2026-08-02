import { describe, expect, it } from 'vitest';

import { isSshUnreachable } from '../src/core/ssh-exec.ts';

describe('isSshUnreachable', () => {
    it('is true when ssh fails before the remote script produced any output', () => {
        expect(isSshUnreachable({ stdout: '', exitCode: 255 })).toBe(true);
        expect(isSshUnreachable({ stdout: '   \n', exitCode: 255 })).toBe(true);
    });

    it('is false when the remote script ran (even if it exited non-zero)', () => {
        expect(isSshUnreachable({ stdout: '/home/serge\n', exitCode: 1 })).toBe(
            false,
        );
    });

    it('is false on success', () => {
        expect(isSshUnreachable({ stdout: '/home/serge\n', exitCode: 0 })).toBe(
            false,
        );
        expect(isSshUnreachable({ stdout: '', exitCode: 0 })).toBe(false);
    });
});
