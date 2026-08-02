import type { CpaneContext } from '../core/config-dir.ts';
import { listProfileFiles } from '../core/profile-loader.ts';

export async function runList(context: CpaneContext): Promise<number> {
    const profiles = await listProfileFiles(context.profilesDir);

    if (profiles.length === 0) {
        console.log(
            `No profiles yet. Create one with \`${context.binaryName} add <name>\`.`,
        );
        return 0;
    }

    for (const profile of profiles) console.log(profile.name);
    return 0;
}
