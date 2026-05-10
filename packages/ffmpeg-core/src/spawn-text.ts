import { spawn } from "node:child_process";

async function drainStream(stream?: NodeJS.ReadableStream): Promise<string> {
  if (!stream) {
    return "";
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString();
}

export type SpawnTextResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; code: number | null; stderr: string };

/**
 * Tek seferlik çocuk süreç; stdout+stderr birleştirilmez — ayrı ayrı döner.
 */
export async function spawnText(
  executable: string,
  args: readonly string[]
): Promise<SpawnTextResult> {
  return await new Promise((resolve) => {
    let settled = false;
    const finalize = (result: SpawnTextResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const subprocess = spawn(executable, [...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });

    const stdoutPromise = drainStream(subprocess.stdout);
    const stderrPromise = drainStream(subprocess.stderr);
    const closePromise = new Promise<number | null>((innerResolve) =>
      subprocess.once("close", (code) => innerResolve(code ?? null))
    );

    subprocess.once("error", (error: NodeJS.ErrnoException) => {
      finalize({ ok: false, code: null, stderr: error.message });
    });

    void Promise.all([stdoutPromise, stderrPromise, closePromise])
      .then(([stdout, stderr, code]) => {
        if (code === 0) {
          finalize({ ok: true, stdout, stderr });
          return;
        }
        finalize({
          ok: false,
          code,
          stderr: stderr.trim().length > 0 ? stderr : stdout
        });
      })
      .catch((error: unknown) => {
        finalize({
          ok: false,
          code: null,
          stderr: error instanceof Error ? error.message : String(error)
        });
      });
  });
}

export function joinedOutput(result: Extract<SpawnTextResult, { ok: true }>): string {
  return `${result.stdout}\n${result.stderr}`.trimEnd();
}
