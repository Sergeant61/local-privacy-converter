import { spawn } from "node:child_process";

export type RunFfmpegJobResult =
  | { ok: true; code: number }
  | { ok: false; code: number | null; stderr: string };

const TIME_IN_STDERR_RE = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/g;

/** stderr içindeki son `time=HH:MM:SS.xx` değerini saniyeye çevirir (FFmpeg ilerleme satırları). */
export function lastFfmpegTimeSecondsFromStderrChunk(text: string): number | null {
  let last: number | null = null;
  const re = new RegExp(TIME_IN_STDERR_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const g1 = m[1];
    const g2 = m[2];
    const g3 = m[3];
    if (g1 === undefined || g2 === undefined || g3 === undefined) {
      continue;
    }
    const h = Number.parseInt(g1, 10);
    const min = Number.parseInt(g2, 10);
    const s = Number.parseFloat(g3);
    const total = h * 3600 + min * 60 + s;
    if (Number.isFinite(total) && total >= 0) {
      last = total;
    }
  }
  return last;
}

export type RunFfmpegJobOptions = {
  /** ffprobe ile bilinen giriş süresi (sn). Yoksa veya ≤0 ise yüzde hesaplanmaz. */
  inputDurationSec?: number | null;
  /**
   * İlerleme: 0–100. Giriş süresi yoksa veya stderr henüz ayrıştırılmadıysa `null`.
   * Tamamlanırken (başarı) tek seferlik `100` gönderilir.
   */
  onProgress?: (percent: number | null) => void;
  /** İptal sinyali. Abort edilince FFmpeg süreci SIGTERM ile sonlandırılır. */
  signal?: AbortSignal;
};

/**
 * FFmpeg çocuk sürecini `shell: false` ile çalıştırır; hata stderr ile gelir.
 */
export async function runFfmpegJob(
  ffmpegExecutable: string,
  args: readonly string[],
  options?: RunFfmpegJobOptions
): Promise<RunFfmpegJobResult> {
  const durationRaw = options?.inputDurationSec;
  const durationSec =
    durationRaw != null && Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : null;
  const onProgress = options?.onProgress;

  return await new Promise<RunFfmpegJobResult>((resolve) => {
    let settled = false;
    const finish = (result: RunFfmpegJobResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    let stderrRoll = "";
    let lastEmitAt = 0;
    let lastEmittedPct: number | null = null;

    const emit = (percent: number | null) => {
      if (!onProgress) {
        return;
      }
      const now = Date.now();
      if (
        percent !== 100 &&
        percent !== null &&
        lastEmittedPct !== null &&
        Math.round(percent) === Math.round(lastEmittedPct) &&
        now - lastEmitAt < 200
      ) {
        return;
      }
      if (percent !== 100 && percent !== null && now - lastEmitAt < 80) {
        return;
      }
      lastEmitAt = now;
      lastEmittedPct = percent;
      onProgress(percent);
    };

    const subprocess = spawn(ffmpegExecutable, [...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });

    const signal = options?.signal;
    if (signal) {
      const onAbort = () => {
        subprocess.kill("SIGTERM");
        // SIGTERM'e cevap vermezse 3 saniye sonra zorla kapat
        setTimeout(() => { if (!settled) subprocess.kill("SIGKILL"); }, 3000);
      };
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    let stderr = "";
    subprocess.stderr?.on("data", (chunk: Buffer | string) => {
      const piece = typeof chunk === "string" ? chunk : chunk.toString();
      stderr += piece;
      stderrRoll = (stderrRoll + piece).slice(-48_000);
      if (durationSec == null) {
        return;
      }
      const t = lastFfmpegTimeSecondsFromStderrChunk(stderrRoll);
      if (t == null) {
        return;
      }
      const pct = Math.min(100, Math.max(0, (t / durationSec) * 100));
      emit(pct);
    });

    subprocess.once("error", (error: NodeJS.ErrnoException) => {
      finish({ ok: false, code: null, stderr: error.message });
    });

    subprocess.once("close", (code) => {
      if (code === 0) {
        if (durationSec != null) {
          emit(100);
        }
        finish({ ok: true, code: 0 });
        return;
      }
      const tail = stderr.trim();
      finish({
        ok: false,
        code: code ?? null,
        stderr: tail.length > 0 ? tail : `FFmpeg çıkış kodu: ${code ?? "?"}`
      });
    });
  });
}
