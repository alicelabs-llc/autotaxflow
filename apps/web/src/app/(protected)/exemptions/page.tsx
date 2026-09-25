'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useUser } from '@/lib/auth';

interface Exemption {
  id: string;
  customerEmail: string | null;
  customerName: string | null;
  customerState: string;
  exemptionType: string;
  certificateNumber: string;
  issuedAt: string;
  expiresAt: string | null;
  fileUrl: string | null;
  status: string;
  notes: string | null;
}

const TYPES = ['RESALE', 'MANUFACTURING', 'NONPROFIT', 'GOVERNMENT', 'AGRICULTURAL', 'OTHER'];
const STATUSES = ['PENDING_REVIEW', 'VALID', 'EXPIRED', 'REJECTED'];

export default function ExemptionsPage() {
  const { token, currentOrg } = useUser();
  const [exemptions, setExemptions] = useState<Exemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customerEmail: '',
    customerName: '',
    customerState: 'CA',
    exemptionType: 'RESALE',
    certificateNumber: '',
    issuedAt: new Date().toISOString().slice(0, 10),
    expiresAt: '',
    fileUrl: '',
    notes: '',
  });

  const reload = () => {
    if (!token || !currentOrg) return;
    fetch(`/api/orgs/${currentOrg.id}/exemptions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setExemptions(data.exemptions || []))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [token, currentOrg]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !currentOrg) return;
    const body: any = {
      ...form,
      issuedAt: new Date(form.issuedAt).toISOString(),
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    };
    if (!body.customerEmail) delete body.customerEmail;
    if (!body.customerName) delete body.customerName;
    if (!body.fileUrl) delete body.fileUrl;
    if (!body.notes) delete body.notes;
    await fetch(`/api/orgs/${currentOrg.id}/exemptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setShowForm(false);
    reload();
  };

  const patch = async (id: string, status: string) => {
    if (!token || !currentOrg) return;
    await fetch(`/api/orgs/${currentOrg.id}/exemptions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    reload();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold">Exemption Certificates</h1>
          <p className="text-slate-600">
            Manage customer resale/non-profit/government exemption certs. Valid certs mean no tax collected.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-brand-600 text-white px-4 py-2 rounded"
        >
          {showForm ? 'Cancel' : '+ Add certificate'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={onSubmit} className="bg-white rounded shadow p-4 mb-6 grid grid-cols-3 gap-3 text-sm">
          <Field label="Customer email (optional)">
            <input type="email" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} className="border rounded px-2 py-1 w-full" />
          </Field>
          <Field label="Customer name (optional)">
            <input type="text" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className="border rounded px-2 py-1 w-full" />
          </Field>
          <Field label="State (2-letter)">
            <input type="text" maxLength={2} value={form.customerState} onChange={(e) => setForm({ ...form, customerState: e.target.value.toUpperCase() })} className="border rounded px-2 py-1 w-full" />
          </Field>
          <Field label="Type">
            <select value={form.exemptionType} onChange={(e) => setForm({ ...form, exemptionType: e.target.value })} className="border rounded px-2 py-1 w-full">
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Certificate #">
            <input type="text" required value={form.certificateNumber} onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })} className="border rounded px-2 py-1 w-full" />
          </Field>
          <Field label="Issued date">
            <input type="date" required value={form.issuedAt} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} className="border rounded px-2 py-1 w-full" />
          </Field>
          <Field label="Expires (optional)">
            <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="border rounded px-2 py-1 w-full" />
          </Field>
          <Field label="File URL (PDF, optional)">
            <input type="url" value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} className="border rounded px-2 py-1 w-full" />
          </Field>
          <Field label="Notes">
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="border rounded px-2 py-1 w-full" />
          </Field>
          <div className="col-span-3">
            <button type="submit" className="bg-brand-600 text-white px-4 py-1 rounded">Save certificate</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded shadow overflow-hidden">
        {loading ? (
          <div className="p-4 text-slate-500">Loading…</div>
        ) : exemptions.length === 0 ? (
          <div className="p-4 text-slate-500">No exemption certificates uploaded yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2">Customer</th>
                <th className="text-left px-4 py-2">State</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Cert #</th>
                <th className="text-left px-4 py-2">Issued</th>
                <th className="text-left px-4 py-2">Expires</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {exemptions.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="px-4 py-2">
                    <div>{e.customerName || '—'}</div>
                    <div className="text-xs text-slate-500">{e.customerEmail || '—'}</div>
                  </td>
                  <td className="px-4 py-2 font-mono">{e.customerState}</td>
                  <td className="px-4 py-2 text-xs">{e.exemptionType}</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.certificateNumber}</td>
                  <td className="px-4 py-2 text-xs">{new Date(e.issuedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-xs">
                    {e.expiresAt ? new Date(e.expiresAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${statusColor(e.status)}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {e.status === 'PENDING_REVIEW' && (
                      <>
                        <button onClick={() => patch(e.id, 'VALID')} className="text-green-600 text-xs mr-2">Approve</button>
                        <button onClick={() => patch(e.id, 'REJECTED')} className="text-red-600 text-xs">Reject</button>
                      </>
                    )}
                    {e.fileUrl && (
                      <a href={e.fileUrl} target="_blank" rel="noreferrer" className="text-brand-600 text-xs ml-2">View file</a>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function statusColor(s: string): string {
  return {
    PENDING_REVIEW: 'bg-amber-100 text-amber-700',
    VALID: 'bg-green-100 text-green-700',
    EXPIRED: 'bg-slate-100 text-slate-700',
    REJECTED: 'bg-red-100 text-red-700',
  }[s] || 'bg-slate-100 text-slate-700';
}
