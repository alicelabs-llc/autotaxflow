'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/auth';

export default function LoginPage() {
  const { login } = useUser();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sso, setSso] = useState<{ enabled: boolean; provider: string } | null>(null);

  // Check SSO config on mount
  useEffect(() => {
    fetch('/api/auth/sso/config')
      .then((r) => r.json())
      .then((data) => setSso(data))
      .catch(() => setSso({ enabled: false, provider: 'generic' }));
  }, []);

  // Handle SSO redirect with token in URL hash (#sso_token=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash.startsWith('#sso_token=')) {
      const token = hash.slice('#sso_token='.length);
      // Fetch user info with the SSO token
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          login(token, data.user);
          // Clear hash before redirect
          history.replaceState(null, '', '/dashboard');
          router.push('/dashboard');
        })
        .catch(() => setError('SSO callback failed'));
    }
  }, [router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Login failed');
      }
      const data = await res.json();
      await login(data.token, data.user);
      router.push('/dashboard');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onSsoClick = () => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/api/auth/sso/login?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const providerLabel: Record<string, string> = {
    google: 'Sign in with Google',
    microsoft: 'Sign in with Microsoft',
    okta: 'Sign in with Okta',
    generic: 'Sign in with SSO',
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-white p-8 rounded shadow max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">Sign in to AutoTaxFlow</h1>

        {sso?.enabled && (
          <>
            <button
              onClick={onSsoClick}
              className="w-full border border-slate-300 hover:border-slate-400 py-2 rounded mb-4 font-medium flex items-center justify-center gap-2"
            >
              <span>{providerLabel[sso.provider] || providerLabel.generic}</span>
            </button>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative text-center text-xs text-slate-500 bg-white px-2 inline-block left-1/2 -translate-x-1/2">
                or continue with email
              </div>
            </div>
          </>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 text-white py-2 rounded disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-center mt-4 text-sm">
          No account?{' '}
          <a href="/register" className="text-brand-600">
            Register
          </a>
        </p>
      </div>
    </div>
  );
}
