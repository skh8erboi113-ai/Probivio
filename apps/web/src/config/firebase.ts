import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

import { env } from './env';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (auth) return auth;

  app = initializeApp({
    apiKey: env.firebase.apiKey,
    authDomain: env.firebase.authDomain,
    projectId: env.firebase.projectId,
    storageBucket: env.firebase.storageBucket,
    messagingSenderId: env.firebase.messagingSenderId,
    appId: env.firebase.appId,
  });

  auth = getAuth(app);
  return auth;
}
