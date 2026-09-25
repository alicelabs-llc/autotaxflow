'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useUser } from '@/lib/auth';

interface Flag {
  id: string;
  state: string;
  severity: string;
  reason: string;
  status: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export default function NexusPage() {
  const { token, currentOrg } = useUser();
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    if (!token || !currentOrg) return;
    setLoading(true);
    fetch(`/api/orgs/${currentOrg.id}/nexus/flags`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setFlags(data.flags || []))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [token, currentOrg]);

  const patch = async (id: string, status: 'ACKNOWLEDGED' | 'RESOLVED') => {
    await fetch(`/api/orgs/${currentOrg!.id}/nexus/flags/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    reload();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Nexus Risk Flags</h1>
      <div className="bg-white rounded shadow overflow-hidden">
        {loading ? (
          <div className="p-4 text-slate-500">Loading…</div>
        ) : flags.length === 0 ? (
          <div className="p-4 text-slate-500">
            No nexus flags triggered. Thresholds not crossed in any state.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2">State</th>
                <th className="text-left px-4 py-2">Severity</th>
                <th className="text-left px-4 py-2">Reason</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Last seen</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr key={f.id} className="border-b">
                  <td className="px-4 py-2 font-mono">{f.state}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        f.severity === 'HIGH'
                          ? 'bg-red-100 text-red-700'
                          : f.severity === 'MEDIUM'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {f.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2">{f.reason}</td>
                  <td className="px-4 py-2">{f.status}</td>
                  <td className="px-4 py-2">
                    {new Date(f.lastSeenAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {f.status === 'OPEN' && (
                      <button
                        onClick={() => patch(f.id, 'ACKNOWLEDGED')}
                        className="text-brand-600 text-xs mr-2"
                      >
                        Acknowledge
                      </button>
                    )}
                    {f.status !== 'RESOLVED' && (
                      <button
                        onClick={() => patch(f.id, 'RESOLVED')}
                        className="text-green-600 text-xs"
                      >
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
