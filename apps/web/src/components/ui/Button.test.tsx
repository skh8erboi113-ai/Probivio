import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it('renders its children as label text', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Click me' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows a loading indicator instead of the label and disables the button while loading', () => {
    render(<Button loading>Save</Button>);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).not.toHaveTextContent('Save');
  });

  it('does not fire onClick while disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards aria-label for accessibility', () => {
    render(<Button aria-label="Approve this action">✓</Button>);
    expect(screen.getByRole('button', { name: 'Approve this action' })).toBeInTheDocument();
  });
});
