/**
 * IPC kanal adlarının tek kaynağı.
 *
 * Bu sabitler eskiden `main.ts` ve `preload.ts` içinde birebir kopyalanmış
 * hâlde duruyordu (31 sabit, iki yerde). İki kopyadan birinde tek harf
 * değişseydi kanal sessizce eşleşmez, çağrı hiçbir hata vermeden sonsuza
 * kadar askıda kalırdı. Artık tek yerde; `channels.test.ts` her handler
 * kanalının gerçekten bağlandığını doğruluyor.
 */

export const VERSION_CHANNEL = "lfc/ffmpeg/get-version";
export const PROBE_CHANNEL = "lfc/media/probe";
export const CAPABILITIES_CHANNEL = "lfc/ffmpeg/capabilities";
export const OPEN_MEDIA_CHANNEL = "lfc/media/open-dialog";
export const SAVE_OUTPUT_CHANNEL = "lfc/media/save-output-dialog";
export const RUN_CONVERT_CHANNEL = "lfc/ffmpeg/convert";
export const RUN_CONVERT_PROGRESS_CHANNEL = "lfc/ffmpeg/convert-progress";
export const READ_PREVIEW_CHANNEL = "lfc/media/read-preview";
export const GET_OUTPUT_DIR_CHANNEL = "lfc/media/get-output-dir";
export const SHOW_IN_FOLDER_CHANNEL = "lfc/shell/show-in-folder";
export const CANCEL_CONVERT_CHANNEL = "lfc/ffmpeg/cancel-convert";
export const AUDIO_MERGE_CHANNEL = "lfc/ffmpeg/audio-merge";
export const VIDEO_MERGE_CHANNEL = "lfc/ffmpeg/video-merge";
export const FRAME_EXTRACT_CHANNEL = "lfc/ffmpeg/frame-extract";
export const GIF_CONVERT_CHANNEL = "lfc/ffmpeg/gif-convert";
export const SETTINGS_GET_CHANNEL = "lfc/settings/get";
export const SETTINGS_SET_CHANNEL = "lfc/settings/set";
export const SUBTITLE_PROBE_CHANNEL = "lfc/ffmpeg/subtitle-probe";
export const SUBTITLE_EXTRACT_CHANNEL = "lfc/ffmpeg/subtitle-extract";
export const VIDEO_TRIM_CHANNEL = "lfc/ffmpeg/video-trim";
export const AUDIO_NORMALIZE_CHANNEL = "lfc/ffmpeg/audio-normalize";
export const WATERMARK_CHANNEL = "lfc/ffmpeg/watermark";
export const METADATA_READ_CHANNEL = "lfc/ffmpeg/metadata-read";
export const METADATA_WRITE_CHANNEL = "lfc/ffmpeg/metadata-write";
export const APNG_CONVERT_CHANNEL = "lfc/ffmpeg/apng-convert";
export const RUN_CONVERT_LOG_CHANNEL = "lfc/ffmpeg/convert-log";
export const PROFILES_GET_CHANNEL = "lfc/profiles/get";
export const PROFILES_SAVE_CHANNEL = "lfc/profiles/save";
export const PROFILES_DELETE_CHANNEL = "lfc/profiles/delete";
export const PDF_CONVERT_CHANNEL = "lfc/ffmpeg/pdf-convert";
export const CHECK_UPDATE_CHANNEL = "lfc/app/check-update";

/**
 * `ipcMain.handle` ile bağlanması gereken kanallar (renderer → main, yanıtlı).
 *
 * `RUN_CONVERT_PROGRESS_CHANNEL` ve `RUN_CONVERT_LOG_CHANNEL` burada YOK:
 * onlar ters yönde çalışıyor (main → renderer, `webContents.send`), handler'ları
 * olmaz. Testler bu listeyi tek tek gezip her kanalın gerçekten bağlandığını
 * doğruluyor — yeni bir kanal eklenip bağlanması unutulursa test kırılır.
 */
export const HANDLER_CHANNELS = [
  VERSION_CHANNEL,
  PROBE_CHANNEL,
  CAPABILITIES_CHANNEL,
  OPEN_MEDIA_CHANNEL,
  SAVE_OUTPUT_CHANNEL,
  RUN_CONVERT_CHANNEL,
  READ_PREVIEW_CHANNEL,
  GET_OUTPUT_DIR_CHANNEL,
  SHOW_IN_FOLDER_CHANNEL,
  CANCEL_CONVERT_CHANNEL,
  AUDIO_MERGE_CHANNEL,
  VIDEO_MERGE_CHANNEL,
  FRAME_EXTRACT_CHANNEL,
  GIF_CONVERT_CHANNEL,
  SETTINGS_GET_CHANNEL,
  SETTINGS_SET_CHANNEL,
  SUBTITLE_PROBE_CHANNEL,
  SUBTITLE_EXTRACT_CHANNEL,
  VIDEO_TRIM_CHANNEL,
  AUDIO_NORMALIZE_CHANNEL,
  WATERMARK_CHANNEL,
  METADATA_READ_CHANNEL,
  METADATA_WRITE_CHANNEL,
  APNG_CONVERT_CHANNEL,
  PROFILES_GET_CHANNEL,
  PROFILES_SAVE_CHANNEL,
  PROFILES_DELETE_CHANNEL,
  PDF_CONVERT_CHANNEL,
  CHECK_UPDATE_CHANNEL
] as const;
