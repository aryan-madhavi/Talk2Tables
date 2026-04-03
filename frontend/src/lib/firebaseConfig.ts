// src/lib/firebaseConfig.ts
// Initialize Firebase app — imported once, used everywhere via `auth` export.
//
// Get values from:
//   Firebase Console → Project Settings → General
//   → Your apps → SDK setup and configuration → Config
//   (This is the WEB APP config — different from the backend service account JSON)

import { initializeApp } from 'firebase/app';
import { getAuth }       from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             as string,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);