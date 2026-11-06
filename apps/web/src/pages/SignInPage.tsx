import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Field, TextInput } from '../components/ui';
import { describeError, useAuth } from '../lib/auth';

type Mode = 'signin' | 'register';

export default function SignInPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, displayName || email.split('@')[0] || 'Player', password);
      }
      navigate(from, { replace: true });
    } catch (caught) {
      // Registration is closed by default on a self-hosted server; say so instead of
      // surfacing a bare 403.
      if (
        caught instanceof Error &&
        'code' in caught &&
        (caught as { code?: string }).code === 'forbidden'
      ) {
        setError('This server is not accepting new accounts. Ask the operator to create one.');
      } else {
        setError(describeError(caught));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">Self-hosted solo RPG</p>
      <h1 className="mt-1 font-display text-4xl leading-tight">Mythweaver</h1>

      <div className="panel mt-6">
        <div className="mb-4 flex gap-1 rounded-lg border border-border p-1" role="tablist">
          {(['signin', 'register'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              className={`min-h-11 flex-1 rounded-md px-3 text-sm ${
                mode === value ? 'bg-accent text-canvas' : 'text-muted hover:text-ink'
              }`}
              onClick={() => {
                setMode(value);
                setError(null);
              }}
            >
              {value === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="email">
            <TextInput
              id="email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              inputMode="email"
              required
            />
          </Field>

          {mode === 'register' ? (
            <Field label="Name" htmlFor="displayName" hint="Shown on your campaigns.">
              <TextInput
                id="displayName"
                value={displayName}
                onChange={setDisplayName}
                autoComplete="name"
              />
            </Field>
          ) : null}

          <Field
            label="Password"
            htmlFor="password"
            hint={mode === 'register' ? 'At least 12 characters.' : undefined}
          >
            <TextInput
              id="password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
            />
          </Field>

          {error ? (
            <p className="alert" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" busy={busy}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="mt-4 text-xs text-muted">
          No third-party account, no AI required. Your campaigns live on this server.
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        <Link to="/" className="underline underline-offset-2 hover:text-ink">
          Back to the table
        </Link>
      </p>
    </div>
  );
}
