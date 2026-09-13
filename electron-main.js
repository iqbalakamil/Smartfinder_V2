const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("path");
const { startServer } = require("./server");
const { autoUpdater } = require("electron-updater");

let mainWindow;
let serverPort;

function checkForUpdates() {
  if (!app.isPackaged) return Promise.resolve();

  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", async () => {
    const result = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart sekarang", "Nanti"],
      defaultId: 0,
      cancelId: 1,
      title: "Update Smart Finder tersedia",
      message: "Update sudah diunduh. Restart aplikasi untuk menerapkannya?",
    });
    if (result.response === 0) autoUpdater.quitAndInstall();
  });

  return Promise.race([
    autoUpdater.checkForUpdates().catch((error) => {
      console.warn("Smart Finder update check failed:", error.message);
    }),
    new Promise((resolve) => setTimeout(resolve, 10000)),
  ]);
}

function createWindow(port) {
  serverPort = port;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: "#0b1220",
    icon: path.join(__dirname, "Smart Finder.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.on("did-finish-load", () => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    dialog.showErrorBox(
      "Smart Finder gagal memuat halaman",
      `${errorDescription} (${errorCode})\n\n${validatedURL}`,
    );
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    dialog.showErrorBox("Smart Finder renderer berhenti", details.reason || "Unknown renderer error");
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`).catch((error) => {
    dialog.showErrorBox("Smart Finder gagal dibuka", error.stack || String(error));
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    app.quit();
  });
}

function startLocalServer() {
  startServer(0, 0, (port) => createWindow(port));
}

app.whenReady().then(checkForUpdates).then(startLocalServer).catch((error) => {
  dialog.showErrorBox("Smart Finder gagal dibuka", error.stack || String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (!mainWindow && serverPort) createWindow(serverPort);
});
