import type { AttachmentStore, JournalAttachment } from '@arvo/finance-core';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

/**
 * Journal screenshots on local disk.
 *
 * The path is generated here (userId/uuid.ext) and validated on the way back in, so the
 * filename the browser supplied never reaches the filesystem — it is kept only as a label.
 * Files are written owner-read/write under a root outside any served or executable path, and
 * nothing is ever uploaded anywhere.
 */
const PATH_PATTERN = /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpg|webp)$/;

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export class LocalAttachmentStore implements AttachmentStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async save(userId: string, filename: string, mimeType: string, bytes: Uint8Array): Promise<JournalAttachment> {
    const extension = EXTENSIONS[mimeType];
    if (!extension) throw new Error('Unsupported attachment type');
    const key = `${userId}/${randomUUID()}.${extension}`;
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
    return {
      path: key,
      // Kept as a label only; it is never used to build a path.
      filename: filename.slice(0, 120),
      mimeType,
      size: bytes.byteLength,
      uploadedAt: new Date().toISOString(),
    };
  }

  async read(_userId: string, path: string): Promise<Uint8Array> {
    return readFile(this.path(path));
  }

  async remove(_userId: string, path: string): Promise<void> {
    await rm(this.path(path), { force: true });
  }

  private path(key: string): string {
    if (!PATH_PATTERN.test(key)) throw new Error('Invalid attachment path');
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error('Invalid attachment path');
    return path;
  }
}
