import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom doesn't implement ResizeObserver, which recharts' ResponsiveContainer
// requires to measure its container. Polyfill with a no-op — layout/sizing
// behavior itself isn't what these tests are verifying.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver ??= ResizeObserverStub;

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
