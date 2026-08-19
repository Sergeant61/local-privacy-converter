import { readFileSync } from "node:fs";

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

// Sürüm numarası tek bir yerde tutulsun: package.json. Arayüz bunu derleme
// anında sabit olarak alıyor, çalışma anında dosya okumuyor.
const pkg: { version: string } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
);

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  server: {
    strictPort: true
  }
});
