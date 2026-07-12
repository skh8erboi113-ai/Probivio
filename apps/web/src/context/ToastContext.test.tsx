import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider, ToastViewport, useToast } from './ToastContext';

function TriggerButton({ message }: { readonly message: string }) {
  const { notify } = useToast();
  return (
    <button type="button" onClick={() => notify('success', message, 50_000)}>
      Trigger
    </button>
  );
}

function renderWithProvider(message = 'Saved successfully') {
  return render(
    <ToastProvider>
      <TriggerButton message={message} />
      <ToastViewport />
    </ToastProvider>,
  );
}

describe('ToastContext accessibility', () => {
  it('renders the viewport as a labeled, polite live region', () => {
    renderWithProvider();
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveAttribute('aria-live', 'polite');
  });

  it('renders each toast as a real, keyboard-operable button (not a div with onClick)', async () => {
    renderWithProvider();

    await userEvent.click(screen.getByRole('button', { name: 'Trigger' }));

    const toast = await screen.findByRole('button', { name: /saved successfully.*dismiss notification/i });
    expect(toast.tagName).toBe('BUTTON');
  });

  it('dismisses the toast on Enter key (native button keyboard behavior) without a mouse', async () => {
    renderWithProvider();

    await userEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    const toast = await screen.findByRole('button', { name: /saved successfully/i });

    toast.focus();
    await userEvent.keyboard('{Enter}');

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /saved successfully/i })).not.toBeInTheDocument(),
    );
  });

  it('auto-dismisses after the configured duration', async () => {
    vi.useFakeTimers();
    try {
      renderWithProvider();
      await act(async () => {
        screen.getByRole('button', { name: 'Trigger' }).click();
      });

      expect(screen.getByRole('button', { name: /saved successfully/i })).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(50_000);
      });

      expect(screen.queryByRole('button', { name: /saved successfully/i })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
