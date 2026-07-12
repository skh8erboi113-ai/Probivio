import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Input } from './Input';

describe('Input accessibility', () => {
  it('associates the visible label with the input via htmlFor/id', () => {
    render(<Input label="Email" />);
    const input = screen.getByLabelText('Email');
    expect(input.tagName).toBe('INPUT');
  });

  it('marks the input as invalid and links it to the error message via aria-describedby', () => {
    render(<Input label="Email" error="Must be a valid email" />);

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const message = screen.getByRole('alert');
    expect(message).toHaveAttribute('id', describedBy);
    expect(message).toHaveTextContent('Must be a valid email');
  });

  it('links a hint (non-error) message via aria-describedby without marking invalid', () => {
    render(<Input label="Password" hint="At least 8 characters" />);

    const input = screen.getByLabelText('Password');
    expect(input).not.toHaveAttribute('aria-invalid');

    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(screen.getByText('At least 8 characters')).toHaveAttribute('id', describedBy);
  });

  it('does not set aria-describedby when there is no error or hint', () => {
    render(<Input label="First name" />);
    expect(screen.getByLabelText('First name')).not.toHaveAttribute('aria-describedby');
  });
});
