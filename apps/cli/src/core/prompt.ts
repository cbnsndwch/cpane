import * as readline from 'node:readline/promises';

async function ask(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    try {
        return (await rl.question(question)).trim();
    } finally {
        rl.close();
    }
}

export async function confirm(
    question: string,
    defaultValue = false,
): Promise<boolean> {
    if (!process.stdin.isTTY) return defaultValue;
    const suffix = defaultValue ? 'Y/n' : 'y/N';
    const answer = (await ask(`${question} [${suffix}] `)).toLowerCase();
    if (!answer) return defaultValue;
    return answer === 'y' || answer === 'yes';
}

export async function promptText(
    question: string,
    defaultValue = '',
): Promise<string> {
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    const answer = await ask(`${question}${suffix}: `);
    return answer || defaultValue;
}

/**
 * Shows a numbered pick-list but always accepts free text too — ssh alias
 * discovery is a soft UX convenience, never a hard dependency (PRD §6.5).
 */
export async function selectOrType(
    question: string,
    options: string[],
): Promise<string> {
    if (options.length > 0) {
        console.log(question);
        for (const [index, option] of options.entries()) {
            console.log(`  ${index + 1}) ${option}`);
        }
        console.log('  (or type a value directly)');
    } else {
        console.log(`${question} (nothing found — type a value directly)`);
    }

    const answer = await ask('> ');
    const index = Number(answer);
    if (Number.isInteger(index) && index >= 1 && index <= options.length) {
        return options[index - 1]!;
    }
    return answer;
}
