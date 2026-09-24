'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/lib/auth';
import Link from 'next/link';

interface RevenueRow {
  state: string;
  grossRevenue: number;
  netRevenue: number;
  txCount: number;
}

export default function DashboardPage() {
  const { token, currentOrg } = useUser();
  const [year] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !currentOrg) return;
    setLoading(true);
    setErr(null);
    fetch(`/api/orgs/${currentOrg.id}/revenue/states?year=${year}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed to fetch');
        return r.json() as Promise<RevenueRow[]>;
      })
      .then(setRows)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [token, currentOrg, year]);

  if (!currentOrg) {
    return (
      <div className="bg-white p-6 rounded shadow text-center">
        <h1 className="text-xl font-semibold mb-2">Welcome to AutoTaxFlow</h1>
        <p className="text-slate-600 mb-4">
          You don't have any organization yet. Create one to get started.
        </p>
        <Link href="/orgs/new" className="bg-brand-600 text-white px-4 py-2 rounded">
          Create organization
        </Link>
      </div>
    );
  }

  const totalGross = rows.reduce((s, r) => s + r.grossRevenue, 0);
  const totalNet = rows.reduce((s, r) => s + r.netRevenue, 0);
  const totalTx = rows.reduce((s, r) => s + r.txCount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{currentOrg.name}</h1>
        <p className="text-slate-600">State revenue aggregation — {year}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Gross Revenue" value={`$${totalGross.toFixed(2)}`} />
        <Stat label="Net Revenue" value={`$${totalNet.toFixed(2)}`} />
        <Stat label="Transactions" value={totalTx.toString()} />
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold">Revenue by state</h2>
        </div>
        {loading ? (
          <div className="p-4 text-slate-500">Loading…</div>
        ) : err ? (
          <div className="p-4 text-red-600">Error: {err}</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-slate-500">
            No revenue data yet. Connect Stripe and wait for the first charge to land.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2">State</th>
                <th className="text-right px-4 py-2">Gross</th>
                <th className="text-right px-4 py-2">Net</th>
                <th className="text-right px-4 py-2">Tx</th>
                <th className="text-left px-4 py-2">Nexus risk</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const nexus = r.grossRevenue >= 100000 || r.txCount >= 200;
                return (
                  <tr key={r.state} className="border-b">
                    <td className="px-4 py-2 font-mono">{r.state}</td>
                    <td className="text-right px-4 py-2">${r.grossRevenue.toFixed(2)}</td>
                    <td className="text-right px-4 py-2">${r.netRevenue.toFixed(2)}</td>
                    <td className="text-right px-4 py-2">{r.txCount}</td>
                    <td className="px-4 py-2">
                      {nexus ? (
                        <span className="text-red-600 font-semibold">⚠ Likely nexus</span>
                      ) : (
                        <span className="text-green-600">Below threshold</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded shadow p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
