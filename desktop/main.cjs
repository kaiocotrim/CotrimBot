const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");
const fs = require("node:fs");
const config = require("./config.json");
const { parseServerUrl, isServerUrl, isExternalUrl, canRequestPermission } = require("./policy.cjs");

const APP_ID = "net.infordoc.cotrimbot";
const SERVER_STORE = "server-url.json";
let serverUrl = null;
let mainWindow;
let quitting = false;

function readStoredServerUrl() {
  try {
    return parseServerUrl(JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), SERVER_STORE), "utf8")).serverUrl);
  } catch { return null; }
}

// Windows installer writes this file; the .deb has no installer step.
function readInstalledServerUrl() {
  try {
    return parseServerUrl(fs.readFileSync(path.join(process.resourcesPath, "server-url.txt"), "utf8").trim());
  } catch { return null; }
}

function saveServerUrl(url) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(path.join(app.getPath("userData"), SERVER_STORE), JSON.stringify({ serverUrl: url }));
}

function askServerUrl(initialUrl) {
  return new Promise(resolve => {
    let result = null;
    const setup = new BrowserWindow({
      title: "CotrimBot", width: 480, height: 260, resizable: false, minimizable: false, maximizable: false,
      autoHideMenuBar: true, backgroundColor: "#09090b",
      webPreferences: {
        preload: path.join(__dirname, "setup-preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true,
      },
    });
    ipcMain.handle("setup:submit", (_event, value) => {
      try { result = parseServerUrl(String(value).trim()); } catch { return { error: "Informe uma URL HTTPS válida, sem credenciais." }; }
      setImmediate(() => setup.close());
      return { ok: true };
    });
    ipcMain.once("setup:cancel", () => setup.close());
    setup.on("closed", () => {
      ipcMain.removeHandler("setup:submit");
      ipcMain.removeAllListeners("setup:cancel");
      resolve(result);
    });
    void setup.loadFile(path.join(__dirname, "setup.html"), { query: { server: initialUrl } });
  });
}

async function resolveServerUrl() {
  if (!app.isPackaged) return parseServerUrl(process.env.COTRIMBOT_DESKTOP_URL || config.serverUrl, true);
  const saved = readStoredServerUrl() ?? readInstalledServerUrl();
  if (saved) return saved;
  const chosen = await askServerUrl(config.serverUrl);
  if (chosen) saveServerUrl(chosen);
  return chosen;
}

async function changeServer() {
  const chosen = await askServerUrl(serverUrl);
  if (!chosen || chosen === serverUrl) return;
  saveServerUrl(chosen);
  app.relaunch();
  app.quit();
}

app.setName("CotrimBot");
app.setAppUserModelId(APP_ID);

function focusWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function openExternal(url) {
  if (!isExternalUrl(url)) return;
  try {
    await shell.openExternal(url);
  } catch {
    if (mainWindow && !mainWindow.isDestroyed()) {
      await dialog.showMessageBox(mainWindow, { type: "error", message: "Não foi possível abrir o link no navegador." });
    }
  }
}

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function startAutoUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", error => console.error("Falha na atualização:", error?.message ?? error));
  const check = () => { void autoUpdater.checkForUpdates().catch(() => {}); };
  check();
  setInterval(check, UPDATE_CHECK_INTERVAL_MS).unref();
}

function configureSession(desktopSession) {
  const grants = new Set();
  desktopSession.setPermissionCheckHandler((contents, permission, origin, details) => {
    if (contents !== mainWindow?.webContents || !isServerUrl(origin, serverUrl)) return false;
    if (permission === "media" && details.mediaType && details.mediaType !== "audio") return false;
    return grants.has(permission);
  });
  desktopSession.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    if (contents !== mainWindow?.webContents || !isServerUrl(contents.getURL(), serverUrl)
      || !isServerUrl(details.requestingUrl, serverUrl) || !canRequestPermission(permission, details)) {
      callback(false);
      return;
    }
    if (grants.has(permission)) { callback(true); return; }
    try {
      const result = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "Permissão do CotrimBot",
        message: permission === "media" ? "Permitir o uso do microfone para gravar mensagens de voz?" : "Permitir notificações de novas mensagens?",
        buttons: ["Permitir", "Agora não"],
        defaultId: 1, cancelId: 1,
      });
      const allowed = result.response === 0 && !contents.isDestroyed();
      if (allowed) grants.add(permission);
      callback(allowed);
    } catch { callback(false); }
  });
}

async function loadServer() {
  while (!quitting && mainWindow && !mainWindow.isDestroyed()) {
    try {
      await mainWindow.loadURL(serverUrl);
      return;
    } catch (error) {
      if (quitting || !mainWindow || mainWindow.isDestroyed() || error.code === "ERR_ABORTED") return;
      focusWindow();
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: "error", title: "Conectar ao CotrimBot",
        message: "Não foi possível conectar ao servidor.",
        detail: "Verifique sua conexão com a internet e tente novamente.",
        buttons: ["Tentar novamente", "Abrir no navegador", "Sair"], defaultId: 0, cancelId: 2,
      });
      if (response === 0) continue;
      if (response === 1) await openExternal(serverUrl);
      app.quit();
      return;
    }
  }
}

function createWindow() {
  const desktopSession = session.fromPartition("persist:cotrimbot");
  mainWindow = new BrowserWindow({
    title: "CotrimBot", width: 1440, height: 920, minWidth: 900, minHeight: 640,
    backgroundColor: "#09090b", autoHideMenuBar: true,
    icon: path.join(__dirname, "assets/icon.png"),
    webPreferences: {
      session: desktopSession, nodeIntegration: false, contextIsolation: true,
      sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
      webviewTag: false, navigateOnDragDrop: false,
    },
  });
  configureSession(desktopSession);
  const contents = mainWindow.webContents;
  contents.setUserAgent(`${contents.getUserAgent()} CotrimBotDesktop/1.1`);
  contents.on("will-attach-webview", event => event.preventDefault());
  contents.on("will-navigate", (event, url) => {
    if (isServerUrl(url, serverUrl)) return;
    event.preventDefault();
    void openExternal(url);
  });
  contents.on("will-redirect", (event, url) => {
    if (!isServerUrl(url, serverUrl)) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isServerUrl(url, serverUrl)) {
      // Keep internal pages in the app; do not grant popups a new renderer.
      setImmediate(() => { if (!contents.isDestroyed()) void contents.loadURL(url).catch(() => {}); });
    } else {
      void openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  void loadServer();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", focusWindow);
  app.on("before-quit", () => { quitting = true; });
  app.on("window-all-closed", () => { if (process.platform !== "darwin" && serverUrl) app.quit(); });
  app.on("activate", () => { if (!serverUrl) return; if (!mainWindow) createWindow(); else focusWindow(); });
  app.whenReady().then(async () => {
    serverUrl = await resolveServerUrl();
    if (!serverUrl) { app.quit(); return; }
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "Aplicativo", submenu: [{ label: "Abrir no navegador", click: () => void openExternal(serverUrl) }, ...(app.isPackaged ? [{ label: "Alterar servidor", click: () => void changeServer() }] : []), { type: "separator" }, { role: "quit", label: "Sair" }] },
      { label: "Editar", submenu: [{ role: "undo", label: "Desfazer" }, { role: "redo", label: "Refazer" }, { type: "separator" }, { role: "cut", label: "Recortar" }, { role: "copy", label: "Copiar" }, { role: "paste", label: "Colar" }, { role: "selectAll", label: "Selecionar tudo" }] },
      { label: "Exibir", submenu: [{ role: "reload", label: "Recarregar" }, { role: "resetZoom", label: "Zoom original" }, { role: "zoomIn", label: "Aumentar zoom" }, { role: "zoomOut", label: "Diminuir zoom" }, { role: "togglefullscreen", label: "Tela cheia" }, ...(!app.isPackaged ? [{ role: "toggleDevTools", label: "Ferramentas do desenvolvedor" }] : [])] },
    ]));
    createWindow();
    startAutoUpdates();
  }).catch(error => {
    dialog.showErrorBox("CotrimBot", error.message);
    app.quit();
  });
}
