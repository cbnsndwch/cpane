/** True if `query`'s characters appear, in order, as a subsequence of `text` (case-insensitive). */
export function fuzzyMatches(query: string, text: string): boolean {
    return fuzzyScore(query, text) > -Infinity;
}

/**
 * Scores a fuzzy subsequence match — higher is better, `-Infinity` for no
 * match. Rewards matches that start earlier in `text` and stay contiguous,
 * so "app" ranks "app" above "apple" above a scattered "a...p...p".
 */
export function fuzzyScore(query: string, text: string): number {
    if (!query) return 0;

    const q = query.toLowerCase();
    const t = text.toLowerCase();

    let score = 0;
    let searchFrom = 0;
    let lastMatchIndex = -1;

    for (const ch of q) {
        const index = t.indexOf(ch, searchFrom);
        if (index === -1) return -Infinity;

        score += index === lastMatchIndex + 1 ? 5 : 1;
        if (index === 0) score += 3;

        lastMatchIndex = index;
        searchFrom = index + 1;
    }

    return score - t.length * 0.01;
}

/** Filters and ranks `items` by fuzzy match against `query`, best first. */
export function fuzzyFilter<T>(
    query: string,
    items: T[],
    getText: (item: T) => string,
): T[] {
    return items
        .map(item => ({ item, score: fuzzyScore(query, getText(item)) }))
        .filter(({ score }) => score > -Infinity)
        .toSorted(
            (a, b) =>
                b.score - a.score ||
                getText(a.item).localeCompare(getText(b.item)),
        )
        .map(({ item }) => item);
}
