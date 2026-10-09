import process from 'node:process';
import { readFile } from 'node:fs/promises';

function finiteInteger(text, cap) {
  if (!/^[1-9][0-9]*$/.test(text.trim())) throw new Error('resource limit must be finite');
  const value = Number(text.trim());
  if (!Number.isSafeInteger(value) || value > cap) throw new Error('resource limit exceeds provider ceiling');
  return value;
}
/** Pure parser for independently observed kernel files, not a containment grant. */
export function validateContainmentObservation(observed) {
  if (observed.platform !== 'linux' || observed.uid < 1 || !Number.isSafeInteger(observed.uid)) throw new Error('nonroot Linux required');
  if (observed.cgroup.trim() !== '0::/') throw new Error('explicit cgroup-v2 root view required');
  if (!/^NoNewPrivs:\s*1$/m.test(observed.status) || !/^CapEff:\s*0+$/m.test(observed.status)) throw new Error('privilege containment required');
  const mounts = observed.mountInfo.split('\n').map(line => line.split(' '));
  const cgMount = mounts.find(fields => fields[4] === '/sys/fs/cgroup' && fields[fields.indexOf('-') + 1] === 'cgroup2');
  if (!cgMount || !cgMount[5].split(',').includes('ro')) throw new Error('read-only cgroup-v2 mount required');
  const rootMount = mounts.find(fields => fields[4] === '/');
  if (!rootMount || !rootMount[5].split(',').includes('ro')) throw new Error('read-only root mount required');
  const memoryBytes = finiteInteger(observed.memory, 512 * 1024 * 1024);
  const pids = finiteInteger(observed.pids, 64);
  if (observed.swap.trim() !== '0') throw new Error('swap must be disabled');
  const parts = observed.cpu.trim().split(/\s+/);
  if (parts.length !== 2) throw new Error('explicit CPU quota required');
  const quota = finiteInteger(parts[0], 1_000_000);
  const period = finiteInteger(parts[1], 1_000_000);
  if (quota > period) throw new Error('CPU quota exceeds one core');
  return { memoryBytes, swapBytes: 0, pids, cpuQuota: quota, cpuPeriod: period,
    scope: 'observed provider cgroup; includes inherited decoder; Runtime mount/namespace/OOM qualification separate' };
}
/** Always reads real, fixed kernel paths. No caller path or platform override. */
export async function assertRuntimeContainment() {
  if (process.platform !== 'linux' || process.getuid() === 0) throw new Error('contained provider requires nonroot Linux');
  const [cgroup, status, memory, swap, pids, cpu, mountInfo] = await Promise.all([
    '/proc/self/cgroup', '/proc/self/status', '/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory.swap.max', '/sys/fs/cgroup/pids.max', '/sys/fs/cgroup/cpu.max', '/proc/self/mountinfo',
  ].map(path => readFile(path, 'utf8')));
  return validateContainmentObservation({ platform: process.platform, uid: process.getuid(), cgroup, status, memory, swap, pids, cpu, mountInfo });
}
