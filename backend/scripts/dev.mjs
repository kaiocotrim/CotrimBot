import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const typescriptCli = path.join(backendDirectory, "node_modules", "typescript", "bin", "tsc");

// Garante que o servidor tenha uma saída atual antes de iniciar os dois watchers.
const initialBuild = spawnSync(process.execPath, [typescriptCli], {
  cwd: backendDirectory,
  stdio: "inherit",
});

if (initialBuild.status !== 0) {
  process.exit(initialBuild.status ?? 1);
}

const compiler = spawn(process.execPath, [typescriptCli, "--watch", "--preserveWatchOutput"], {
  cwd: backendDirectory,
  stdio: "inherit",
});

const server = spawn(
  process.execPath,
  ["--watch", "--watch-preserve-output", "dist/src/server.js"],
  {
    cwd: backendDirectory,
    stdio: "inherit",
  },
);

let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  compiler.kill();
  server.kill();
  process.exit(exitCode);
}

compiler.on("exit", (code, signal) => {
  if (!shuttingDown) {
    console.error(`Compilador encerrado (${signal ?? code ?? "sem código"}).`);
    shutdown(code ?? 1);
  }
});

server.on("exit", (code, signal) => {
  if (!shuttingDown) {
    console.error(`Servidor encerrado (${signal ?? code ?? "sem código"}).`);
    shutdown(code ?? 1);
  }
});

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
