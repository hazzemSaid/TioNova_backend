import * as dotenv from 'dotenv';
import * as admin from 'firebase-admin';

dotenv.config();

// Normalize Firebase Admin credentials from env (handles escaped newlines)
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (privateKey) {
  privateKey = privateKey.trim(); // Trim any leading/trailing whitespace
  privateKey = privateKey.replace(/\\n/g, '\n'); // Convert escaped LF sequences to real newlines
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

export { admin };
