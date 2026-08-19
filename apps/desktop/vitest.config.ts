import { defineConfig } from "vitest/config";

/**
 * Ana süreç (Electron main) testleri.
 *
 * Ayrı bir dosya olmasının nedeni `vite.config.ts`: orası SvelteKit
 * eklentisini yüklüyor ve renderer'ı derliyor. Buradaki testler ise düz
 * Node modülleri — `electron`, `@lfc/ffmpeg-core` koşucuları ve
 * `./ffmpeg-resolve` taklit edilerek koşuyor, tarayıcıya hiç ihtiyaç yok.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["electron/**/*.test.ts"]
  }
});
