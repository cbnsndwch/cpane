import { describe, expect, it } from 'vitest';

import { fuzzyFilter, fuzzyMatches } from '../src/core/fuzzy.ts';

describe('fuzzyMatches', () => {
    it('matches an empty query against anything', () => {
        expect(fuzzyMatches('', 'app-vm')).toBe(true);
    });

    it('matches a subsequence regardless of gaps', () => {
        expect(fuzzyMatches('av', 'app-vm')).toBe(true);
        expect(fuzzyMatches('apvm', 'app-vm')).toBe(true);
    });

    it('is case-insensitive', () => {
        expect(fuzzyMatches('APP', 'app-vm')).toBe(true);
    });

    it("doesn't match out-of-order or missing characters", () => {
        expect(fuzzyMatches('va', 'app-vm')).toBe(false);
        expect(fuzzyMatches('xyz', 'app-vm')).toBe(false);
    });
});

describe('fuzzyFilter', () => {
    const items = ['web-scratch', 'app-vm', 'app', 'db-replica'];

    it('excludes non-matches and ranks contiguous/prefix matches first', () => {
        const ranked = fuzzyFilter('app', items, item => item);
        expect(ranked).toEqual(['app', 'app-vm']);
    });

    it('returns all items in stable alphabetical order for an empty query', () => {
        expect(fuzzyFilter('', items, item => item)).toEqual([
            'app',
            'app-vm',
            'db-replica',
            'web-scratch',
        ]);
    });

    it('returns an empty array when nothing matches', () => {
        expect(fuzzyFilter('zzz', items, item => item)).toEqual([]);
    });
});
