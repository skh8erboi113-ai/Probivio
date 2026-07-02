import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { fonts, palette, spacing } from '../theme';

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      notify('success', 'Welcome');
      navigate('/');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: palette.bg,
        padding: spacing.lg,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Card accent="accent">
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
            <div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '0.2em',
                  color: palette.accent,
                  fontFamily: fonts.mono,
                  textTransform: 'uppercase',
                }}
              >
                Streamline
              </div>
              <h1
                style={{
                  fontFamily: fonts.display,
                  fontSize: 28,
                  fontWeight: 700,
                  margin: `${spacing.xs}px 0 0`,
                  color: palette.text,
                }}
              >
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </h1>
            </div>

            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}
            >
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />

              <Button type="submit" loading={submitting}>
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              style={{
                background: 'none',
                border: 'none',
                color: palette.textMuted,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: fonts.sans,
              }}
            >
              {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
