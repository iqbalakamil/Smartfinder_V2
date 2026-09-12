const { startServer } = require("./server");

const DEFAULT_PORT = Number(process.env.PORT || 3000);
const HOST = "127.0.0.1";

// ANSI escape colors for OSIRIS console logging
const C_CYAN = "\x1b[96m";
const C_GREEN = "\x1b[92m";
const C_YELLOW = "\x1b[93m";
const C_GRAY = "\x1b[90m";
const C_WHITE = "\x1b[97;1m";
const C_RESET = "\x1b[0m";

function openBrowser(url) {
  if (process.platform === "win32") {
    const { spawn } = require("child_process");
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }

  if (process.platform === "darwin") {
    const { spawn } = require("child_process");
    spawn("open", [url], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }

  const { spawn } = require("child_process");
  spawn("xdg-open", [url], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`\n  ${C_YELLOW}[!] Menerima ${signal}. Menutup Smartkidz Server Engine...${C_RESET}`);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer(DEFAULT_PORT, 0, (port) => {
  const url = `http://${HOST}:${port}`;
  console.log(`  ${C_GREEN}[✔] RECON SERVER ENGINE ONLINE${C_RESET}`);
  console.log(`  ${C_WHITE}[+] TARGET LOCAL URL :${C_RESET} ${C_CYAN}${url}${C_RESET}`);
  console.log(`  ${C_WHITE}[+] SERVER STATUS    :${C_RESET} ${C_GREEN}200 OK (LISTENING)${C_RESET}`);
  console.log(`  ${C_WHITE}[+] BROWSER LAUNCH   :${C_RESET} ${C_GRAY}Membuka browser ke ${url}...${C_RESET}`);
  console.log(`  ${C_GRAY}────────────────────────────────────────────────────────────────────────────${C_RESET}`);
  console.log(`  ${C_YELLOW}[i] Tekan CTRL + C untuk menghentikan server command center.${C_RESET}\n`);
  openBrowser(url);
});

