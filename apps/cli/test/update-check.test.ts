import { describe, expect, it } from 'vitest';

import { isNewerVersion } from '../src/core/update-check.ts';

describe('isNewerVersion', () => {
    it('compares core versions', () => {
        expect(isNewerVersion('1.2.4', '1.2.3')).toBe(true);
        expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
        expect(isNewerVersion('1.2.2', '1.2.3')).toBe(false);
        expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
    });

    it('treats a full release as newer than a prerelease of the same core version', () => {
        expect(isNewerVersion('1.2.3', '1.2.3-rc.1')).toBe(true);
        expect(isNewerVersion('1.2.3-rc.1', '1.2.3')).toBe(false);
    });

    it('compares prerelease numbers within the same core version', () => {
        expect(isNewerVersion('1.2.3-rc.2', '1.2.3-rc.1')).toBe(true);
        expect(isNewerVersion('1.2.3-rc.1', '1.2.3-rc.2')).toBe(false);
    });
});
