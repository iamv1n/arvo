import type { FileStore } from '@arvo/finance-core';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

const KEY_PATTERN = /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(csv|xlsx|pdf)$/;

/**
 * Stores statements under a root directory outside any served or executable path.
 * Keys are generated server-side (userId/uuid.ext) and validated, so user input never
 * reaches the filesystem path. Files are written owner-read/write only.
 */
export class LocalFileStore implements FileStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async save(key: string, bytes: Uint8Array): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
  }

  async read(key: string): Promise<Uint8Array> {
    return readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  private path(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return path;
  }
}
