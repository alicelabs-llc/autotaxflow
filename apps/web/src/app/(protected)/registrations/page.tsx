'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useUser } from '@/lib/auth';

interface Registration {
  id: string;
  state: string;
  status: string;
  stateTaxId: string | null;
  registeredAt: string | null;
  nextFilingDue: string | null;
  filingFrequency: string | null;
  permitNumber: string | null;
  notes: string | null;
}

const STATUSES = [
  'NOT_REGISTERED',
  'REGISTERING',
  'REGISTERED',
  'PERMIT_PENDING',
  'ACTIVE_FILING',
  'VOLUNTARY_CLOSED',
  'REVOKED',
];

export default function RegistrationsPage() {
  const { token, currentOrg } = useUser();
  const [regs, setRegs] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState({ state: 'CA', filingFrequency: 'QUARTERLY', notes: '' });

  const reload = () => {
    if (!token || !currentOrg) return;
    fetch(`/api/orgs/${currentOrg.id}/registrations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setRegs(data.registrations || []))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [token, currentOrg]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !currentOrg) return;
    await fetch(`/api/orgs/${currentOrg.id}/registrations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(formState),
    });
    setFormState({ state: 'CA', filingFrequency: 'QUARTERLY', notes: '' });
    setShowForm(false);
    reload();
  };

  const patch = async (state: string, status: string) => {
    if (!token || !currentOrg) return;
    await fetch(`/api/orgs/${currentOrg.id}/registrations/${state}`, {
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
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold">State Registrations</h1>
          <p className="text-slate-600">Track your sales tax registration status in each state where you have nexus.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-brand-600 text-white px-4 py-2 rounded"
        >
          {showForm ? 'Cancel' : '+ Track new state'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={onSubmit} className="bg-white rounded shadow p-4 mb-6 grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs uppercase text-slate-500 mb-1">State</label>
            <input
              type="text"
              maxLength={2}
              value={formState.state}
              onChange={(e) => setFormState({ ...formState, state: e.target.value.toUpperCase() })}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-500 mb-1">Filing frequency</label>
            <select
              value={formState.filingFrequency}
              onChange={(e) => setFormState({ ...formState, filingFrequency: e.target.value })}
              className="border rounded px-2 py-1 w-full"
            >
              <option>MONTHLY</option>
              <option>QUARTERLY</option>
              <option>ANNUALLY</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-500 mb-1">Notes</label>
            <input
              type="text"
              value={formState.notes}
              onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div className="col-span-3">
            <button type="submit" className="bg-brand-600 text-white px-4 py-1 rounded">
              Start tracking
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded shadow overflow-hidden">
        {loading ? (
          <div className="p-4 text-slate-500">Loading…</div>
        ) : regs.length === 0 ? (
          <div className="p-4 text-slate-500">
            No states tracked yet. Add a state where you&apos;ve triggered nexus to start tracking your registration process.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2">State</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Tax ID</th>
                <th className="text-left px-4 py-2">Permit #</th>
                <th className="text-left px-4 py-2">Frequency</th>
                <th className="text-left px-4 py-2">Next filing due</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {regs.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="px-4 py-2 font-mono">{r.state}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${statusColor(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{r.stateTaxId || '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.permitNumber || '—'}</td>
                  <td className="px-4 py-2 text-xs">{r.filingFrequency || '—'}</td>
                  <td className="px-4 py-2 text-xs">
                    {r.nextFilingDue ? new Date(r.nextFilingDue).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <select
                      defaultValue=""
                      onChange={(e) => patch(r.state, e.target.value)}
                      className="border rounded text-xs px-2 py-1"
                    >
                      <option value="">Change status →</option>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
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

function statusColor(s: string): string {
  const map: Record<string, string> = {
    NOT_REGISTERED: 'bg-slate-100 text-slate-700',
    REGISTERING: 'bg-amber-100 text-amber-700',
    REGISTERED: 'bg-blue-100 text-blue-700',
    PERMIT_PENDING: 'bg-amber-100 text-amber-700',
    ACTIVE_FILING: 'bg-green-100 text-green-700',
    VOLUNTARY_CLOSED: 'bg-slate-100 text-slate-700',
    REVOKED: 'bg-red-100 text-red-700',
  };
  return map[s] || 'bg-slate-100 text-slate-700';
}
