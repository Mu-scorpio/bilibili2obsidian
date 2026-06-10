import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createDecipheriv, pbkdf2Sync } from 'crypto';

function getChromeCookieDbPath(): string | null {
  const home = homedir();
  const candidates = [
    join(home, 'Library/Application Support/Google/Chrome/Default/Cookies'),
    join(home, 'Library/Application Support/Google/Chrome/Profile 1/Cookies'),
    join(home, '.config/google-chrome/Default/Cookies'),
    join(home, '.config/chromium/Default/Cookies'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function getChromeKey(): Buffer {
  try {
    const password = execFileSync('/usr/bin/security', [
      '-q', 'find-generic-password',
      '-w', '-a', 'Chrome', '-s', 'Chrome Safe Storage',
    ], { encoding: 'utf-8', timeout: 5000 }).trim();
    return pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
  } catch {}
  return pbkdf2Sync('peanuts', 'saltysalt', 1003, 16, 'sha1');
}

function decryptV10(encrypted: Buffer, key: Buffer): string {
  if (!encrypted || encrypted.length < 19) return '';
  const prefix = encrypted.slice(0, 3).toString('ascii');
  if (prefix !== 'v10' && prefix !== 'v11') {
    return encrypted.toString('utf-8');
  }
  const iv = encrypted.slice(3, 19);
  const ciphertext = encrypted.slice(19);
  try {
    const decipher = createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(true);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const str = decrypted.toString('utf-8');
    const match = str.match(/[0-9a-f]{8}%2C\d+%2C[0-9a-f]+%2A[A-Za-z0-9_\-]+/);
    if (match) return match[0] + str.slice(match.index! + match[0].length);
    return str;
  } catch {
    return '';
  }
}

export function readBilibiliSessdata(): string | null {
  const dbPath = getChromeCookieDbPath();
  if (!dbPath) return null;

  const key = getChromeKey();

  // Use sqlite3 CLI (available on macOS by default)
  try {
    const hex = execFileSync('sqlite3', [
      dbPath,
      "SELECT hex(encrypted_value) FROM cookies WHERE (host_key LIKE '%.bilibili.com' OR host_key LIKE '%.bilibili.cn') AND name='SESSDATA' LIMIT 1",
    ], { encoding: 'utf-8', timeout: 5000 }).trim();

    if (!hex) return null;
    const encrypted = Buffer.from(hex, 'hex');
    return decryptV10(encrypted, key) || null;
  } catch {
    return null;
  }
}
