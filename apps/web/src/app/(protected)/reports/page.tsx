'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useUser } from '@/lib/auth';

interface Report {
  id: string;
  type: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  fileUrl: string | null;
  createdAt: string;
}

export default function ReportsPage() {
  const { token, currentOrg } = useUser();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<'MONTHLY_SUMMARY' | 'CPA_EXPORT_CSV' | 'NEXUS_RISK_PDF'>(
    'MONTHLY_SUMMARY'
  );
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const reload = () => {
    if (!token || !currentOrg) return;
    setLoading(true);
    fetch(`/api/orgs/${currentOrg.id}/reports`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setReports(data.reports || []))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [token, currentOrg]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/orgs/${currentOrg!.id}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type,
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || 'Failed');
      return;
    }
    reload();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Reports</h1>

      <form onSubmit={onSubmit} className="bg-white p-4 rounded shadow mb-6 grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs uppercase text-slate-500 mb-1">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as any)} className="border rounded px-2 py-1 w-full">
            <option value="MONTHLY_SUMMARY">Monthly Summary</option>
            <option value="CPA_EXPORT_CSV">CPA Export CSV</option>
            <option value="NEXUS_RISK_PDF">Nexus Risk PDF</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-500 mb-1">From</label>
          <input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="border rounded px-2 py-1 w-full" />
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-500 mb-1">To</label>
          <input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="border rounded px-2 py-1 w-full" />
        </div>
        <div className="flex items-end">
          <button type="submit" className="bg-brand-600 text-white px-4 py-1 rounded">
            Request
          </button>
        </div>
        {error && <p className="col-span-4 text-red-600 text-sm">{error}</p>}
      </form>

      <div className="bg-white rounded shadow overflow-hidden">
        {loading ? (
          <div className="p-4 text-slate-500">Loading…</div>
        ) : reports.length === 0 ? (
          <div className="p-4 text-slate-500">No reports yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2">Created</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Period</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Download</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="px-4 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2">{r.type}</td>
                  <td className="px-4 py-2">
                    {new Date(r.periodStart).toLocaleDateString()} →{' '}
                    {new Date(r.periodEnd).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">{r.status}</td>
                  <td className="px-4 py-2 text-right">
                    {r.status === 'READY' ? (
                      <a href={`/api/orgs/${currentOrg?.id}/reports/${r.id}/download`} className="text-brand-600">
                        Download
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
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
