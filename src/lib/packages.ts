// src/lib/packages.ts
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const PACKAGE_FILE = path.join(process.cwd(), 'packages.json');

type PackageRecord = {
  name?: string;
  mobile: string;
  packageAmount?: number;
  totalHours?: number;
  usedHours?: number;
  remainingHours?: number;
  expiryDate?: string;
  status?: 'active' | 'expired' | 'inactive' | string;
  [k: string]: any;
};

async function readPackagesFile(): Promise<Record<string, PackageRecord>> {
  try {
    const txt = await readFile(PACKAGE_FILE, 'utf-8');
    return JSON.parse(txt || '{}');
  } catch (err: any) {
    // If file doesn't exist, return empty object (init elsewhere)
    if (err.code === 'ENOENT') {
      return {};
    }
    console.error('Error reading packages file:', err);
    throw err;
  }
}

async function writePackagesFile(obj: Record<string, PackageRecord>) {
  // Write atomically (overwriting)
  const data = JSON.stringify(obj, null, 2);
  await writeFile(PACKAGE_FILE, data, 'utf-8');
}

/** Ensure file exists */
export async function initPackageFile() {
  try {
    // If file does not exist, this will throw and we create it
    await readFile(PACKAGE_FILE, 'utf-8');
  } catch {
    await writePackagesFile({});
  }
}

/** Get package by mobile (returns null if not found) */
export async function getPackage(mobile: string): Promise<PackageRecord | null> {
  if (!mobile) return null;
  const all = await readPackagesFile();
  return all[mobile] ?? null;
}

/** Save (or update) a package record by mobile */
export async function savePackage(mobile: string, pkg: PackageRecord): Promise<PackageRecord> {
  if (!mobile) throw new Error('Mobile required for savePackage');
  const all = await readPackagesFile();
  all[mobile] = { ...(all[mobile] ?? {}), ...pkg, mobile };
  await writePackagesFile(all);
  return all[mobile];
}

/** Deduct hours from a package; returns updated pkg or null if none */
export async function deductPackageHours(mobile: string, hours: number): Promise<PackageRecord | null> {
  if (!mobile) throw new Error('mobile required');
  if (!hours || hours <= 0) hours = 0;

  const pkg = await getPackage(mobile);
  if (!pkg) return null;

  pkg.usedHours = (pkg.usedHours || 0) + Number(hours);
  pkg.totalHours = pkg.totalHours || 0;
  pkg.remainingHours = Math.max(0, (pkg.totalHours || 0) - (pkg.usedHours || 0));

  const now = new Date();
  if (pkg.expiryDate) {
    const expiry = new Date(pkg.expiryDate);
    pkg.status = (pkg.remainingHours <= 0 || now > expiry) ? 'expired' : 'active';
  } else {
    pkg.status = (pkg.remainingHours <= 0) ? 'expired' : (pkg.status || 'active');
  }

  await savePackage(mobile, pkg);
  return pkg;
}
