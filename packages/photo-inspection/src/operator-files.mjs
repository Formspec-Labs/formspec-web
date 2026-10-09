import { open } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
/** Read at most the bound+1 from one regular operator-owned descriptor. */
export async function readOperatorFile(path, maximum) {
  const file = await open(path, 'r');
  try {
    if (!(await file.stat()).isFile()) throw new Error('regular operator file required');
    const buffer = Buffer.alloc(maximum + 1);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await file.read(buffer, used, buffer.length - used, used);
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used > maximum) throw new Error('operator file exceeds bound');
    return buffer.subarray(0, used);
  } finally { await file.close(); }
}
