import fs from "node:fs";
import path from "node:path";

import { app } from "electron";

/**
 * Gömülü ikililerin bulunduğu tek dizin (DENETIM.md D-19).
 *
 * Paketlenmiş uygulamada `resources/ffmpeg/`, geliştirmede `extra-resources/ffmpeg/`.
 * İkisini de `scripts/prepare-ffmpeg.mjs` doldurur, aynı manifestten ve aynı
 * sağlama toplamı kontrolünden geçerek. Böylece geliştirmede çalışan ffmpeg ile
 * kullanıcıya giden ffmpeg aynı ikili olur — eskiden değildi.
 */
function bundledBinaryDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "ffmpeg")
    : path.join(app.getAppPath(), "extra-resources", "ffmpeg");
}

const FETCH_HINT =
  "Gömülü ikililer yok. `pnpm ffmpeg:fetch` çalıştırın (sürüm ve sağlama toplamları scripts/ffmpeg-manifest.json içinde sabit).";

/**
 * Kullanıcı tarafından seçilmiş bir ikili yolunu doğrular.
 *
 * Güvenlik: bu değer bir zamanlar renderer'dan ham string olarak geliyor ve hiçbir
 * kontrolden geçmeden `spawn` ediliyordu — yani tek bir doğrulanmamış IPC çağrısı
 * kalıcı bir arka kapıya dönüşebiliyordu. Artık yol yalnızca ana süreçteki dosya
 * diyaloğundan gelebilir; buna rağmen ayarlar dosyası elle düzenlenebileceği için
 * kullanım anında da doğrulanır.
 */
function validateExecutablePath(candidate: string, label: string): string {
  if (!path.isAbsolute(candidate)) {
    throw new Error(`${label} yolu mutlak olmalı: ${candidate}`);
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(candidate);
  } catch {
    throw new Error(`${label} bulunamadı: ${candidate}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} bir dosya değil: ${candidate}`);
  }
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
  } catch {
    throw new Error(`${label} çalıştırılabilir değil: ${candidate}`);
  }
  return candidate;
}

function ffmpegBinaryName(): string {
  return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

/**
 * FFmpeg yolu: kullanıcı geçersiz kılma → LFC_FFMPEG_PATH → gömülü ikili (7.1).
 */
export function resolveFfmpegExecutable(override?: string | undefined): string {
  const trimmed = override?.trim();
  if (trimmed && trimmed.length > 0) {
    return validateExecutablePath(trimmed, "Özel FFmpeg");
  }

  const fromEnv = process.env.LFC_FFMPEG_PATH?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return validateExecutablePath(fromEnv, "LFC_FFMPEG_PATH");
  }

  const bundled = path.join(bundledBinaryDir(), ffmpegBinaryName());
  if (fs.existsSync(bundled)) {
    return bundled;
  }

  throw new Error(`Gömülü FFmpeg bulunamadı: ${bundled}\n${FETCH_HINT}`);
}

function ffprobeBinaryName(): string {
  return process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
}

/**
 * ffprobe yolu: özel ffmpeg'in yanındaki ffprobe → LFC_FFPROBE_PATH →
 * gömülü ikili (7.1).
 *
 * **Parametre ffmpeg'in yoludur, ffprobe'unki değil.** Eskiden kullanıcının
 * ayarladığı ffmpeg yolu doğrudan ffprobe olarak döndürülüyordu: ffmpeg,
 * `-print_format json -show_streams` gibi ffprobe argümanlarıyla çalıştırılıyor
 * ve her probe hata veriyordu (DENETIM.md D-20). Doğrusu, özel bir FFmpeg
 * kurulumunun yanındaki ffprobe'u aramak — aynı derlemeden geldiği için sürüm
 * uyumu da kendiliğinden sağlanır.
 *
 * Gömülü ffprobe artık gömülü ffmpeg ile aynı derlemeden geliyor (ikisi de 7.1,
 * doğru mimaride). Eskiden ffprobe `ffprobe-static` paketinden 4.4 olarak
 * geliyordu — üç major sürüm geride, üstelik Apple Silicon'da Rosetta altında —
 * ve uygulamanın kendi ürettiği AVIF dosyasını okuyamıyordu (DENETIM.md D-19).
 */
export function resolveFfprobeExecutable(ffmpegBinaryOverride?: string | undefined): string {
  const trimmed = ffmpegBinaryOverride?.trim();
  if (trimmed && trimmed.length > 0) {
    const sibling = path.join(path.dirname(trimmed), ffprobeBinaryName());
    if (fs.existsSync(sibling)) {
      return validateExecutablePath(sibling, "Özel ffprobe");
    }
    // Yanında ffprobe yoksa gömülüye düş — ffmpeg'i ffprobe sanıp çalıştırmaktan iyidir.
  }

  const fromEnv = process.env.LFC_FFPROBE_PATH?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return validateExecutablePath(fromEnv, "LFC_FFPROBE_PATH");
  }

  const bundled = path.join(bundledBinaryDir(), ffprobeBinaryName());
  if (fs.existsSync(bundled)) {
    return bundled;
  }

  throw new Error(`Gömülü ffprobe bulunamadı: ${bundled}\n${FETCH_HINT}`);
}
