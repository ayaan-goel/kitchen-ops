// Runs the domain test suite under several process time zones to prove the rules
// never depend on the server's local time (NFR-02, TRD §4.2).
import { spawnSync } from 'node:child_process';

const zones = ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati'];
let failed = false;

for (const tz of zones) {
  console.log(`\n=== TZ=${tz} ===`);
  const result = spawnSync('pnpm', ['exec', 'vitest', 'run'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, TZ: tz },
  });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
