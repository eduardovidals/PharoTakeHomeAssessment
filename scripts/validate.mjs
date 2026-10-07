import { spawnSync } from 'node:child_process';

// Each lane has real producers. A failed or missing command fails the entire run.
const commands = [
  [process.execPath, ['scripts/check-workspace.mjs']],
  ['pnpm', ['lint']],
  ['pnpm', ['typecheck']],
  ['pnpm', ['test']],
  ['pnpm', ['build']],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
