import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  readonly id: string;
  readonly variant: ToastVariant;
  readonly message: string;
  readonly durationMs: number;
}

interface ToastContextValue {
  readonly toasts: readonly Toast[];
  readonly show: (variant: ToastVariant, message: string, durationMs?: number) => void;
  readonly dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (variant: ToastVariant, message: string, durationMs = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const toast: Toast = { id, variant, message, durationMs };
      setToasts((current) => [...current, toast]);
      window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/**
 * Renders active toasts in a fixed container.
 */
export function ToastViewport(): JSX.Element {
  const { toasts, dismiss } = useToast();

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 9999,
        maxWidth: 380,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          onClick={() => dismiss(toast.id)}
          style={{
            padding: '12px 16px',
            borderRadius: 6,
            background: variantColor(toast.variant),
            color: '#fff',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontSize: 14,
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function variantColor(variant: ToastVariant): string {
  switch (variant) {
    case 'success':
      return '#16a34a';
    case 'error':
      return '#dc2626';
    case 'warning':
      return '#d97706';
    case 'info':
    default:
      return '#0284c7';
  }
}
