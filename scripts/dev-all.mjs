import { spawn } from 'node:child_process';
import process from 'node:process';

const rootDir = process.cwd();
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const dockerCommand = process.platform === 'win32' ? 'docker.exe' : 'docker';

function toShellCommand(command, args) {
  const quote = (value) => (/[\s"]/u.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value);
  return [quote(command), ...args.map(quote)].join(' ');
}

function runCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(toShellCommand(command, args), {
      cwd: rootDir,
      shell: true,
      stdio: 'inherit',
    });

    child.on('error', (error) => {
      reject(new Error(`${label} could not start: ${error.message}`));
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

function startLongRunningProcess(name, args) {
  const child = spawn(toShellCommand(pnpmCommand, args), {
    cwd: rootDir,
    shell: true,
    stdio: 'inherit',
  });

  const exitPromise = new Promise((resolve, reject) => {
    child.on('error', (error) => reject(new Error(`${name} could not start: ${error.message}`)));
    child.on('exit', (code) => resolve({ name, code: code ?? 0 }));
  });

  return { name, child, exitPromise };
}

function stopProcessTree(child, signal = 'SIGTERM') {
  if (!child.pid) {
    return;
  }

  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      cwd: rootDir,
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  child.kill(signal);
}

const processes = [];
let shuttingDown = false;

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`\n[dev] Stopping web, api, and worker (${signal})...`);

  for (const processInfo of processes) {
    if (!processInfo.child.killed) {
      stopProcessTree(processInfo.child, signal);
    }
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function main() {
  console.log('[dev] Starting Postgres and Jira with docker compose...');
  await runCommand(dockerCommand, ['compose', 'up', '-d', 'postgres', 'jira'], 'docker compose up');

  console.log('[dev] Starting API, web, and worker watchers...');
  processes.push(
    startLongRunningProcess('api', ['--filter', 'api', 'dev']),
    startLongRunningProcess('web', ['--filter', 'web', 'dev']),
    startLongRunningProcess('worker', ['--filter', 'worker', 'dev']),
  );

  const firstExit = await Promise.race(processes.map((processInfo) => processInfo.exitPromise));
  shutdown();

  const exitCode = firstExit.code === 0 ? 0 : firstExit.code;
  if (exitCode !== 0) {
    throw new Error(`${firstExit.name} exited unexpectedly with code ${exitCode}.`);
  }
}

main().catch((error) => {
  shutdown();
  console.error(`[dev] ${error.message}`);
  process.exit(1);
});