import { redirect } from 'next/navigation';
import { ReactNode } from 'react';
import { AuthProvider, useUser } from '@/lib/auth';
import { NavBar } from '@/components/NavBar';

// Force SSR/dynamic rendering — estas páginas usan localStorage (client-only),
// no se pueden prerenderizar estáticamente.
export const dynamic = 'force-dynamic';

function Shell({ children }: { children: ReactNode }) {
  const { ready, user } = useUser();
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-slate-500">Loading…</span>
      </div>
    );
  }
  if (!user) redirect('/login');
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-6">{children}</main>
    </div>
  );
}

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
