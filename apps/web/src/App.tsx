import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Emblem } from './components/ui';
import { useAuth } from './lib/auth';
import CampaignPage from './pages/CampaignPage';
import CampaignsPage from './pages/CampaignsPage';
import SignInPage from './pages/SignInPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <p className="py-10 text-sm text-muted" role="status">
        Checking your session…
      </p>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

function Header() {
  const { status, user, signOut } = useAuth();

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 py-2.5">
        <Link to="/" className="flex items-center gap-2 text-ink">
          <Emblem size={20} />
          <span className="display text-lg leading-none">Mythweaver</span>
        </Link>

        {status === 'authenticated' ? (
          <div className="flex items-center gap-2">
            <span className="eyebrow hidden sm:inline">{user.displayName}</span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                void signOut();
              }}
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:text-canvas"
      >
        Skip to content
      </a>

      <Header />

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-5 py-6 pb-16">
        <Routes>
          <Route path="/signin" element={<SignInPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <CampaignsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/campaigns/:id"
            element={
              <RequireAuth>
                <CampaignPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-5 pb-8 text-[11px] leading-relaxed text-muted">
        <p className="border-t border-border pt-3">
          Mythweaver is independent software. Ironsworn is by Shawn Tomkin; its SRD content is used
          under CC BY 4.0 and attributed when it ships.
        </p>
      </footer>
    </div>
  );
}
