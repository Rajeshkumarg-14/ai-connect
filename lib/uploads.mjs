import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, statSync, lstatSync, unlinkSync, rmdirSync } from 'node:fs';
import { resolve, dirname, join, extname, basename, win32, sep } from 'node:path';
import { AppError, required } from './store.mjs';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.json', '.csv', '.tsv', '.yaml', '.yml', '.toml', '.xml', '.log', '.ini', '.conf', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs', '.c', '.h', '.cpp', '.hpp', '.cs', '.css', '.scss', '.html', '.sh', '.ps1', '.sql', '.vue', '.svelte', '.rb', '.php']);
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
export function uploadMetadata(upload) {
  const { path, ...safe } = upload; return safe;
}
export class Uploads {
  constructor(store) { this.store = store; this.root = resolve(dirname(store.file), 'uploads'); this.store.data.uploads ??= []; }
  save(input) {
    const room = this.store.room(input.roomId);
    if (room.archived) throw new AppError('Restore this room before uploading files.');
    const name = basename(win32.basename(required(input.name, 'File name', 300))).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 160);
    if (!name || name === '.' || name === '..') throw new AppError('Choose a valid file name.');
    const extension = extname(name).toLowerCase();
    const kind = IMAGE_TYPES[extension] ? 'image' : extension === '.pdf' ? 'pdf' : TEXT_EXTENSIONS.has(extension) || (!extension && /^text\//.test(input.type ?? '')) ? 'text' : null;
    if (!kind) throw new AppError('Unsupported file type. Attach text/source files, JSON, Markdown, CSV, PNG, JPEG, WebP, or PDF.');
    if (typeof input.data !== 'string' || input.data.length > Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 || input.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)) throw new AppError('Use a valid base64 file of no more than 8 MiB.');
    const bytes = Buffer.from(input.data, 'base64');
    if (bytes.toString('base64') !== input.data) throw new AppError('The attachment data is not valid base64.');
    if (!bytes.length) throw new AppError('The selected file is empty.');
    if (bytes.length > MAX_UPLOAD_BYTES) throw new AppError('Files must be no larger than 8 MiB.', 413);
    if (kind === 'image') {
      const valid = extension === '.png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : ['.jpg', '.jpeg'].includes(extension) ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
      if (!valid) throw new AppError('The file contents do not match its image type.');
    }
    if (kind === 'pdf' && bytes.subarray(0, 5).toString() !== '%PDF-') throw new AppError('The file contents do not match a PDF.');
    if (kind === 'text' && bytes.includes(0)) throw new AppError('This source file appears to contain binary data. Choose a text file instead.');
    const roomSize = this.store.data.uploads.filter(u => u.roomId === room.id).reduce((sum, u) => sum + u.size, 0);
    const totalSize = this.store.data.uploads.reduce((sum, u) => sum + u.size, 0);
    if (roomSize + bytes.length > 128 * 1024 * 1024 || totalSize + bytes.length > 512 * 1024 * 1024) throw new AppError('Connect upload storage is full. Delete an unused room and its attachments before uploading more files.', 413);
    const id = randomUUID(); const directory = join(this.root, room.id);
    mkdirSync(directory, { recursive: true });
    if (lstatSync(this.root).isSymbolicLink() || lstatSync(directory).isSymbolicLink()) throw new AppError('The upload directory must be a regular local directory.');
    const path = join(directory, `${id}${extension || '.txt'}`);
    writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
    const upload = { id, roomId: room.id, name, type: kind === 'image' ? IMAGE_TYPES[extension] : kind === 'pdf' ? 'application/pdf' : 'text/plain', kind, size: bytes.length, path, createdAt: new Date().toISOString() };
    try { this.store.data.uploads.push(upload); this.store.save(); }
    catch (error) { this.store.data.uploads = this.store.data.uploads.filter(u => u.id !== id); try { unlinkSync(path); } catch {} throw error; }
    return uploadMetadata(upload);
  }
  get(id) {
    const upload = this.store.data.uploads.find(u => u.id === id);
    if (!upload) throw new AppError('Attachment was not found.', 404);
    const path = resolve(upload.path);
    if (!path.startsWith(`${this.root}${sep}`) || lstatSync(path).isSymbolicLink() || !statSync(path).isFile()) throw new AppError('Attachment is unavailable.', 404);
    return { upload, bytes: readFileSync(path) };
  }
  deleteRoom(roomId) {
    for (const item of this.store.data.uploads.filter(u => u.roomId === roomId)) {
      const path = resolve(item.path);
      if (path.startsWith(`${this.root}${sep}`)) try { unlinkSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    try { rmdirSync(join(this.root, roomId)); } catch (error) { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error; }
  }
}
