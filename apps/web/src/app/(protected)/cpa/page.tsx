'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/lib/auth';
import Link from 'next/link';

interface CpaOrgSummary {
  organizationId: string;
  organizationName: string;
  openFlags: number;
  resolvedFlags: number;
  ytdRevenue: number;
  ytdTx: number;
  statesCovered: string[];
}

/**
 * CPA Portal — para usuarios con rol CPA_READONLY.
 * Muestra un dashboard multi-org: cada client org con su conteo de flags
 * y YTD revenue. Click en una org para ver detalle.
 *
 * Solo accesible si el usuario tiene al menos una membresía CPA_READONLY.
 */
export default function CpaPortalPage() {
  const { token, user } = useUser();
  const [orgs, setOrgs] = useState<CpaOrgSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch('/api/cpa/summary', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setOrgs(data.orgs || []))
      .catch(() => setOrgs([]))
      .finally(() => setLoading(false));
  }, [token]);

  const totalOpen = orgs.reduce((s, o) => s + o.openFlags, 0);
  const totalResolved = orgs.reduce((s, o) => s + o.resolvedFlags, 0);
  const totalYtd = orgs.reduce((s, o) => s + o.ytdRevenue, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">CPA Portal</h1>
        <p className="text-slate-600">
          Multi-client view · {user?.email} · {orgs.length} client organization{orgs.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Stat label="Open Nexus Flags" value={totalOpen} accent="red" />
        <Stat label="Resolved Flags" value={totalResolved} accent="green" />
        <Stat label="Aggregate YTD Revenue" value={`$${totalYtd.toFixed(2)}`} accent="blue" />
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold">Client organizations</h2>
        </div>
        {loading ? (
          <div className="p-4 text-slate-500">Loading…</div>
        ) : orgs.length === 0 ? (
          <div className="p-4 text-slate-500">
            You don&apos;t have CPA access to any organization yet. Ask a client org
            OWNER to add you with the CPA_READONLY role.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2">Client</th>
                <th className="text-right px-4 py-2">YTD Revenue</th>
                <th className="text-right px-4 py-2">YTD Tx</th>
                <th className="text-right px-4 py-2">Open Flags</th>
                <th className="text-left px-4 py-2">States covered</th>
                <th className="text-right px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.organizationId} className="border-b">
                  <td className="px-4 py-2 font-medium">{o.organizationName}</td>
                  <td className="text-right px-4 py-2">${o.ytdRevenue.toFixed(2)}</td>
                  <td className="text-right px-4 py-2">{o.ytdTx}</td>
                  <td className="text-right px-4 py-2">
                    {o.openFlags > 0 ? (
                      <span className="text-red-600 font-semibold">{o.openFlags}</span>
                    ) : (
                      <span className="text-green-600">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{o.statesCovered.join(', ') || '—'}</td>
                  <td className="text-right px-4 py-2">
                    <Link
                      href={`/dashboard?orgId=${o.organizationId}`}
                      className="text-brand-600 text-xs"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-900">
        <strong>CPA role (read-only):</strong> You can view client data, acknowledge and resolve
        nexus flags, and request reports on their behalf. You cannot edit transactions, change
        billing, or modify rulesets.
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: 'red' | 'green' | 'blue';
}) {
  const colorClass =
    accent === 'red'
      ? 'text-red-700'
      : accent === 'green'
      ? 'text-green-700'
      : 'text-brand-700';
  return (
    <div className="bg-white rounded shadow p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</div>
    </div>
  );
}
