import { runAdd } from './commands/add.ts';
import { runConnect } from './commands/connect.ts';
import { runEdit } from './commands/edit.ts';
import { runList } from './commands/list.ts';
import { runPicker } from './commands/picker.tsx';
import { runReplicateProfiles } from './commands/replicate.ts';
import { runShellInit } from './commands/shell-init.ts';
import { runSync } from './commands/sync.ts';
import { runUpgrade } from './commands/upgrade.ts';
import { runWizard } from './commands/wizard.tsx';
import { resolveContext } from './core/config-dir.ts';
import { SHELL_KINDS } from './core/shell-init.ts';
import { checkForUpdate } from './core/update-check.ts';
import { VERSION } from './version.ts';

function printHelp(binaryName: string): void {
    console.log(`${binaryName} — declarative tmux session profiles over SSH

Usage:
  ${binaryName} <profile>            Connect to (or create) a profile's tmux session
  ${binaryName}                      Open a fuzzy-search picker over all profiles
  ${binaryName} list                 List profile names
  ${binaryName} add <name>           Scaffold a new profile, then open it in $EDITOR
  ${binaryName} add --wizard         Guided flow to build a new profile — no YAML required
  ${binaryName} edit <name>          Open an existing profile in $EDITOR
  ${binaryName} sync <profile>       Capture a live session's structure back into its profile
  ${binaryName} shell-init <shell>   One shell function per profile — eval from your shell rc (${SHELL_KINDS.join('|')})
  ${binaryName} upgrade              Upgrade to the latest release on this channel
  ${binaryName} replicate-profiles   Copy cpane profiles into cpanext for rc testing
  ${binaryName} --version            Print the version
  ${binaryName} --help               Show this help
`);
}

export async function main(argv: string[]): Promise<number> {
    const [command, ...rest] = argv;

    if (command === '--version' || command === '-v') {
        console.log(VERSION);
        return 0;
    }

    const context = resolveContext();

    if (command === '--help' || command === '-h' || command === 'help') {
        printHelp(context.binaryName);
        return 0;
    }

    // Skip the notice right before `upgrade` (about to check anyway) and
    // `shell-init` (its stdout gets eval'd directly by the caller's shell —
    // any stray line breaks that). Printed to stderr regardless, since a
    // notice is never a command's primary output.
    if (command !== 'upgrade' && command !== 'shell-init') {
        const notice = await checkForUpdate(context, VERSION);
        if (notice) console.error(notice.message);
    }

    if (!command) return runPicker(context);

    switch (command) {
        case 'list':
            return runList(context);
        case 'add':
            return rest.includes('--wizard')
                ? runWizard(context)
                : runAdd(context, rest[0]);
        case 'edit':
            return runEdit(context, rest[0]);
        case 'sync':
            return runSync(context, rest[0]);
        case 'shell-init':
            return runShellInit(context, rest[0]);
        case 'upgrade':
            return runUpgrade(context, VERSION);
        case 'replicate-profiles':
            return runReplicateProfiles();
        default:
            // No verb needed to connect — same reasoning as `ssh <host>` (PRD §6.2).
            return runConnect(context, command);
    }
}
