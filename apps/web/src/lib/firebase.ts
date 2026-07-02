import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

import { getEnv } from './env';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  const env = getEnv();
  app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  return app;
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(getFirebaseApp());
  return auth;
}
