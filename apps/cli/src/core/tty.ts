/**
 * OpenTUI's renderer expects a real interactive terminal on both ends. Fed a
 * non-TTY stdin/stdout (piped output, cron, CI) it doesn't fail fast — it
 * spins retrying terminal negotiation forever. Callers must check this
 * before creating a renderer and fail fast themselves instead.
 */
export function isInteractiveTty(): boolean {
    return Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
}
