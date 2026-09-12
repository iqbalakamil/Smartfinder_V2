const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("path");
const { startServer } = require("./server");

let mainWindow;
let serverPort;

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
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.on("closed", () => {
    mainWindow = null;
    app.quit();
  });
}

function startLocalServer() {
  startServer(0, 0, (port) => createWindow(port));
}

app.whenReady().then(startLocalServer).catch((error) => {
  dialog.showErrorBox("Smart Finder gagal dibuka", error.stack || String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (!mainWindow && serverPort) createWindow(serverPort);
});
