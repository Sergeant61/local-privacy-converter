import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { app, BrowserWindow, Menu, nativeImage, net, Notification, protocol, shell, Tray } from "electron";

// Register before app.whenReady so Chromium honours the scheme as "secure"
protocol.registerSchemesAsPrivileged([
  { scheme: "lpc", privileges: { secure: true, standard: true, supportFetchAPI: true } },
]);

// IPC handler'larının tamamı ./ipc-handlers.ts içinde: 1300 satır ve testi
// olmayan tek bir fonksiyondu, test edilebilmesi için ayrıldı (K-02).
// Burada kalanlar gerçekten pencereye/işletim sistemine bağlı olan işler.
import { loadSettings, wireIpcHandlers } from "./ipc-handlers";



// Must be set before app.whenReady() so menu bar and dock show the correct name
app.setName("Local Privacy Converter");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function setTaskbarProgress(progress: number | null) {
  if (!mainWindow) return;
  if (progress === null) {
    mainWindow.setProgressBar(-1);
  } else {
    mainWindow.setProgressBar(progress / 100);
  }
}

function createTray() {
  const resourceBase = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "..", "build-resources");

  try {
    // Build a multi-resolution native image for 1x + Retina @2x
    const img = nativeImage.createEmpty();
    const path1x = path.join(resourceBase, "tray-icon.png");
    const path2x = path.join(resourceBase, "tray-icon@2x.png");
    img.addRepresentation({ scaleFactor: 1.0, dataURL: nativeImage.createFromPath(path1x).toDataURL() });
    if (fs.existsSync(path2x)) {
      img.addRepresentation({ scaleFactor: 2.0, dataURL: nativeImage.createFromPath(path2x).toDataURL() });
    }
    // White template adapts to dark/light menu bar on macOS
    if (process.platform === "darwin") img.setTemplateImage(true);
    tray = new Tray(img);
    tray.setToolTip("Local Privacy Converter");
    updateTrayMenu("Hazır");
    tray.on("double-click", () => {
      mainWindow?.show();
    });
  } catch {
    // Tray may not be supported on all platforms
  }
}

function updateTrayMenu(statusLabel: string) {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: "Local Privacy Converter", enabled: false },
    { label: `Durum: ${statusLabel}`, enabled: false },
    { type: "separator" },
    { label: "Göster", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: "Gizle", click: () => { mainWindow?.hide(); } },
    { type: "separator" },
    { label: "Çıkış", click: () => { app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function notifyCompletion(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));



/**
 * İçerik Güvenliği Politikası (DENETIM.md D-07).
 *
 * `'unsafe-inline'` script için kaçınılmaz: SvelteKit'in statik çıktısı
 * hidrasyonu satır içi bir `<script>` ile başlatıyor. Geri kalan her şey
 * kapalı — özellikle `connect-src 'self'`, çünkü bu uygulamanın satış noktası
 * medyanın makineden çıkmaması. Önizlemeler `data:`/`blob:`/`file:` üzerinden
 * geldiği için yalnızca img/media bunlara açık.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: file:",
  "media-src 'self' data: blob: file:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'none'"
].join("; ");

/** Uygulamanın kendi içeriğinin yaşadığı kökenler. Başka hiçbiri gezinemez. */
function isTrustedOrigin(rawUrl: string, devUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol === "lpc:") return true;
    if (devUrl.length > 0 && rawUrl.startsWith(devUrl)) return true;
    return false;
  } catch {
    return false;
  }
}

async function createWindow(): Promise<void> {
  const devUrl = process.env.VITE_DEV_SERVER_URL?.trim() ?? "";
  const isMac = process.platform === "darwin";

  const window = new BrowserWindow({
    width: 980,
    height: 660,
    minWidth: 920,
    minHeight: 600,
    title: "Local Privacy Converter",
    show: false,
    // ── macOS'ta yerel pencere kabuğu ──────────────────────────────────────
    //
    // `hiddenInset` başlık çubuğunu kaldırıp trafik ışıklarını içeriğin üstüne
    // bindiriyor; kenar çubuğu pencerenin tepesine kadar uzanıyor (Finder,
    // Mail, Sistem Ayarları'nın kullandığı düzen).
    //
    // `vibrancy` (saydam kenar çubuğu) denendi ama AÇILMADI: çalışması için
    // pencerenin opak olmaması gerekiyor (`backgroundColor: "#00000000"`) ve
    // gövdenin de saydam boyanması gerekiyor. Bu üçlü, fare girdisinin
    // pencereye nasıl ulaştığını değiştirdiği için elle sınanmadan açılmamalı.
    // Görsel bir incelik; tıklanabilirlik ise şart.
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 14, y: 18 }
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // preload yalnızca Electron API'si kullanıyor (contextBridge/ipcRenderer/
      // webUtils), bu yüzden sandbox açılabiliyor — renderer süreci Node'suz
      // kalıyor ve OS seviyesinde kısıtlanıyor.
      sandbox: true,
      webviewTag: false,
      // Renderer'ın `file://` üzerinden rastgele yerel dosya çekmesini engeller;
      // önizleme yolları zaten ana süreçten data: URL olarak geliyor.
      allowRunningInsecureContent: false
    }
  });

  // CSP'yi başlıkla veriyoruz: statik HTML'e meta etiketi gömmek SvelteKit
  // build'ini her sürümde elle düzeltmek demekti.
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          devUrl.length > 0
            // Vite HMR websocket'i ve eval tabanlı dönüşümleri geliştirmede
            // gerekli; paketlenmiş sürüme sızmasın diye ayrı tutuluyor.
            ? CONTENT_SECURITY_POLICY.replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'").replace("connect-src 'self'", "connect-src 'self' ws: http://localhost:*")
            : CONTENT_SECURITY_POLICY
        ]
      }
    });
  });

  // Yeni pencere açma denemesi = uygulamanın kendi akışı değil. Harici bağlantı
  // kullanıcının tarayıcısına gider, Electron penceresine değil.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Güvenilmeyen bir kökene gezinme, ele geçirilmiş bir renderer'ın preload
  // köprüsünü uzak bir sayfaya taşımasının en kısa yoludur.
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedOrigin(url, devUrl)) {
      event.preventDefault();
      if (url.startsWith("https://")) void shell.openExternal(url);
    }
  });

  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  mainWindow = window;
  window.once("ready-to-show", () => window.show());

  if (devUrl.length > 0) {
    await window.loadURL(devUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    await window.loadURL("lpc://localhost/");
  }
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  // Serve the SvelteKit static build via lpc:// so that absolute asset paths
  // (/_app/immutable/...) resolve correctly in the packaged app.
  const buildDir = path.join(__dirname, "..", "build");
  protocol.handle("lpc", (req) => {
    const { pathname } = new URL(req.url);
    const filePath = pathname === "/" || pathname === ""
      ? path.join(buildDir, "index.html")
      : path.join(buildDir, decodeURIComponent(pathname));
    // Statik sunucu build dizininden dışarı çıkamaz (DENETIM.md D-07).
    const resolved = path.resolve(filePath);
    if (resolved !== path.resolve(buildDir) && !resolved.startsWith(path.resolve(buildDir) + path.sep)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(resolved).toString());
  });

  loadSettings();
  wireIpcHandlers({ setTaskbarProgress, updateTrayMenu, notifyCompletion });
  await createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch((error: unknown) => console.error(error));
    }
  });
}

void bootstrap().catch((error: unknown) => console.error(error));

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
