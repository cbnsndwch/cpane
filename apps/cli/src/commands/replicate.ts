import { replicateStableProfilesToRc } from '../core/replicate.ts';

export async function runReplicateProfiles(): Promise<number> {
    const result = await replicateStableProfilesToRc();

    if (result.copiedOrUpdated.length === 0) {
        console.log('No stable (cpane) profiles to replicate into cpanext.');
        return 0;
    }

    console.log(
        `Replicated ${result.copiedOrUpdated.length} profile(s) from cpane into cpanext:`,
    );
    for (const name of result.copiedOrUpdated) console.log(`  - ${name}`);
    return 0;
}
