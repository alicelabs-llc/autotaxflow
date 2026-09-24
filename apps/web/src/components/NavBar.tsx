'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@/lib/auth';

export function NavBar() {
  const pathname = usePathname();
  const { user, organizations, currentOrg, logout, switchOrg } = useUser();

  if (!user) return null;

  const navItems = [
    { href: `/dashboard`, label: 'Dashboard' },
    { href: `/transactions`, label: 'Transactions' },
    { href: `/nexus`, label: 'Nexus Flags' },
    { href: `/tax`, label: 'Tax Calc' },
    { href: `/registrations`, label: 'State Regs' },
    { href: `/exemptions`, label: 'Exemptions' },
    { href: `/vat`, label: 'VAT/GST' },
    { href: `/reports`, label: 'Reports' },
    { href: `/cpa`, label: 'CPA Portal' },
  ];

  return (
    <nav className="border-b bg-white">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-bold text-brand-700">
            AutoTaxFlow
          </Link>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={`${currentOrg ? '/' + currentOrg.id + item.href : item.href}`}
              className={`text-sm ${
                pathname?.includes(item.href) ? 'text-brand-700 font-semibold' : 'text-slate-600'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-4">
          {organizations.length > 0 && (
            <select
              value={currentOrg?.id || ''}
              onChange={(e) => switchOrg(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.role})
                </option>
              ))}
            </select>
          )}
          <span className="text-sm text-slate-600">{user.email}</span>
          <button onClick={logout} className="text-sm text-slate-500 hover:text-slate-900">
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
