'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface OrgItem {
  id: string;
  name: string;
  country: string;
  baseCurrency: string;
  role: string;
}

interface User {
  id: string;
  email: string;
  name: string | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  organizations: OrgItem[];
  currentOrg: OrgItem | null;
  login: (token: string, user: User) => Promise<void>;
  logout: () => void;
  switchOrg: (orgId: string) => void;
  ready: boolean;
}

const Ctx = createContext<AuthState | undefined>(undefined);

const TOKEN_KEY = 'autotaxflow:token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<OrgItem[]>([]);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  const currentOrgId = typeof window !== 'undefined' ? localStorage.getItem('autotaxflow:orgId') : null;
  const currentOrg = organizations.find((o) => o.id === currentOrgId) || organizations[0] || null;

  const loadOrgs = async (t: string) => {
    try {
      const res = await fetch('/api/orgs/', {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.organizations || []);
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) {
      setToken(t);
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${t}` } })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => {
          setUser(data.user);
          return loadOrgs(t);
        })
        .catch(() => {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        })
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, []);

  const login = async (t: string, u: User) => {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
    await loadOrgs(t);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('autotaxflow:orgId');
    setToken(null);
    setUser(null);
    setOrganizations([]);
    router.push('/login');
  };

  const switchOrg = (orgId: string) => {
    localStorage.setItem('autotaxflow:orgId', orgId);
    router.refresh();
  };

  return (
    <Ctx.Provider value={{ token, user, organizations, currentOrg, login, logout, switchOrg, ready }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUser() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useUser must be used within AuthProvider');
  return ctx;
}
