import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Firebase mock so components using useAuth work in tests
vi.mock('../config/firebase', () => ({
  getFirebaseApp: () => ({}),
  getFirebaseAuth: () => ({
    currentUser: null,
    onAuthStateChanged: (cb: (u: null) => void) => {
      cb(null);
      return () => undefined;
    },
  }),
}));
