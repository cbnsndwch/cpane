import { describe, expect, it } from 'vitest';

import { parseSshConfigHosts } from '../src/core/ssh-config.ts';

describe('parseSshConfigHosts', () => {
    it('extracts simple Host aliases', () => {
        const text = `
Host app-vm
    HostName 10.0.0.5
    User serge
    Port 2222
    IdentityFile ~/.ssh/id_app

Host web
    HostName web.example.com
    User serge
`;
        expect(parseSshConfigHosts(text)).toEqual(['app-vm', 'web']);
    });

    it('splits multiple aliases on one Host line', () => {
        expect(
            parseSshConfigHosts('Host db db-replica\n  HostName 10.0.0.9\n'),
        ).toEqual(['db', 'db-replica']);
    });

    it('drops wildcard patterns', () => {
        expect(
            parseSshConfigHosts('Host *\n  ForwardAgent yes\n\nHost app-vm\n'),
        ).toEqual(['app-vm']);
        expect(parseSshConfigHosts('Host 10.0.0.?\n')).toEqual([]);
    });

    it('is case-insensitive on the Host keyword', () => {
        expect(parseSshConfigHosts('host app-vm\n')).toEqual(['app-vm']);
    });

    it('ignores comment lines and trailing comments', () => {
        const text = `
# Host commented-out
Host app-vm # the app box
`;
        expect(parseSshConfigHosts(text)).toEqual(['app-vm']);
    });

    it('never reads HostName/User/Port lines as aliases', () => {
        const text =
            'HostName should-not-appear\nUser should-not-appear-either\n';
        expect(parseSshConfigHosts(text)).toEqual([]);
    });

    it('deduplicates and sorts aliases', () => {
        expect(
            parseSshConfigHosts('Host web\nHost app-vm\nHost web\n'),
        ).toEqual(['app-vm', 'web']);
    });

    it('returns an empty array for empty input', () => {
        expect(parseSshConfigHosts('')).toEqual([]);
    });
});
