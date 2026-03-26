import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// service-account.json: in mcp-server/../ (repo root)
const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  join(__dirname, '../..',  'service-account.json');

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

export const db = getFirestore();

export async function getUserData(userId: string) {
  const doc = await db.collection('users').doc(userId).get();
  if (!doc.exists) {
    throw new Error(`User ${userId} not found`);
  }
  return doc.data()!;
}

export async function updateUserData(userId: string, data: Record<string, unknown>) {
  await db.collection('users').doc(userId).set(data, { merge: true });
}
