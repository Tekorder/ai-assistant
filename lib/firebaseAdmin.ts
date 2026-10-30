import 'server-only';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

/* ===================== Firebase Admin =====================
 * Server-side Firebase (service account in FIREBASE_ADMIN_*). Used to mint the
 * one-time codes behind our own auth emails (password reset), so the emails
 * are sent through Twilio with our own design instead of Firebase's. */

function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // .env stores the key on one line with literal "\n"
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY are not defined');
  }

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}
