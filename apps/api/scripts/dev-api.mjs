import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const workingDirectory = process.cwd();
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const entryFile = resolve(workingDirectory, 'dist', 'apps', 'api', 'src', 'main.js');
const processes = [];
let shuttingDown = false;

function toShellCommand(command, args) {
  const quote = (value) => (/[\s"]/u.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value);
  return [quote(command), ...args.map(quote)].join(' ');
}

function spawnManaged(command, args, label) {
  const child = spawn(toShellCommand(command, args), {
    cwd: workingDirectory,
    shell: true,
    stdio: 'inherit',
  });

  const exitPromise = new Promise((resolve, reject) => {
    child.on('error', (error) => reject(new Error(`${label} could not start: ${error.message}`)));
    child.on('exit', (code) => resolve({ label, code: code ?? 0 }));
  });

  const processInfo = { child, exitPromise };
  processes.push(processInfo);
  return processInfo;
}

function stopProcessTree(child, signal = 'SIGTERM') {
  if (!child.pid) {
    return;
  }

  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      cwd: workingDirectory,
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  child.kill(signal);
}

async function waitForEntryFile(timeoutMs = 120000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (existsSync(entryFile)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${entryFile} to be built.`);
}

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const processInfo of processes) {
    if (!processInfo.child.killed) {
      stopProcessTree(processInfo.child, signal);
    }
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function main() {
  console.log('[api-dev] Starting Nest incremental build watcher...');
  const buildWatcher = spawnManaged(pnpmCommand, ['build', '--watch'], 'api build watcher');

  await waitForEntryFile();

  console.log('[api-dev] Starting Node watcher for built API output...');
  const runtimeWatcher = spawnManaged(process.execPath, ['--watch', entryFile], 'api runtime watcher');

  const firstExit = await Promise.race([buildWatcher.exitPromise, runtimeWatcher.exitPromise]);
  shutdown();

  if (firstExit.code !== 0) {
    throw new Error(`${firstExit.label} exited unexpectedly with code ${firstExit.code}.`);
  }
}

main().catch((error) => {
  shutdown();
  console.error(`[api-dev] ${error.message}`);
  process.exit(1);
});