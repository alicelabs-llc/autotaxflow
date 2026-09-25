'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useUser } from '@/lib/auth';

interface VatRegistration {
  id: string;
  regime: string;
  country: string;
  vatNumber: string | null;
  thresholdAmount: number;
  thresholdCurrency: string;
  registeredAt: string | null;
  notes: string | null;
}

const REGIMES = ['EU_OSS', 'EU_IOSS', 'UK_VAT', 'AU_GST', 'NZ_GST', 'CA_GST_HST', 'COUNTRY_VAT'];

export default function VatPage() {
  const { token, currentOrg } = useUser();
  const [regs, setRegs] = useState<VatRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    regime: 'EU_OSS',
    country: 'DE',
    vatNumber: '',
    thresholdAmount: 10000,
    thresholdCurrency: 'EUR',
    notes: '',
  });

  const reload = () => {
    if (!token || !currentOrg) return;
    fetch(`/api/orgs/${currentOrg.id}/vat/registrations`, {
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
    const body: any = { ...form };
    if (!body.vatNumber) delete body.vatNumber;
    if (!body.notes) delete body.notes;
    await fetch(`/api/orgs/${currentOrg.id}/vat/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setShowForm(false);
    reload();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold">VAT / GST Cross-Border</h1>
          <p className="text-slate-600">
            Track VAT/GST registrations for EU OSS/IOSS, UK, AU, NZ, CA and other regimes.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-brand-600 text-white px-4 py-2 rounded"
        >
          {showForm ? 'Cancel' : '+ Track registration'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={onSubmit} className="bg-white rounded shadow p-4 mb-6 grid grid-cols-4 gap-3 text-sm">
          <Field label="Regime">
            <select value={form.regime} onChange={(e) => setForm({ ...form, regime: e.target.value })} className="border rounded px-2 py-1 w-full">
              {REGIMES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Country (2-letter ISO)">
            <input type="text" maxLength={2} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} className="border rounded px-2 py-1 w-full" />
          </Field>
          <Field label="VAT number (optional)">
            <input type="text" value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} className="border rounded px-2 py-1 w-full" />
          </Field>
          <Field label="Threshold amount">
            <input type="number" step="0.01" value={form.thresholdAmount} onChange={(e) => setForm({ ...form, thresholdAmount: parseFloat(e.target.value) || 0 })} className="border rounded px-2 py-1 w-full" />
          </Field>
          <Field label="Threshold currency">
            <select value={form.thresholdCurrency} onChange={(e) => setForm({ ...form, thresholdCurrency: e.target.value })} className="border rounded px-2 py-1 w-full">
              <option>EUR</option>
              <option>USD</option>
              <option>GBP</option>
              <option>CHF</option>
              <option>AUD</option>
              <option>NZD</option>
              <option>CAD</option>
              <option>JPY</option>
            </select>
          </Field>
          <Field label="Notes">
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="border rounded px-2 py-1 w-full" />
          </Field>
          <div className="col-span-4">
            <button type="submit" className="bg-brand-600 text-white px-4 py-1 rounded">Save</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded shadow overflow-hidden">
        {loading ? (
          <div className="p-4 text-slate-500">Loading…</div>
        ) : regs.length === 0 ? (
          <div className="p-4 text-slate-500">
            No VAT/GST registrations yet. Track EU OSS, UK, AU GST, or other regimes where you cross thresholds.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2">Regime</th>
                <th className="text-left px-4 py-2">Country</th>
                <th className="text-left px-4 py-2">VAT #</th>
                <th className="text-right px-4 py-2">Threshold</th>
                <th className="text-left px-4 py-2">Registered</th>
                <th className="text-left px-4 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {regs.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="px-4 py-2 font-mono">{r.regime}</td>
                  <td className="px-4 py-2 font-mono">{r.country}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.vatNumber || '—'}</td>
                  <td className="px-4 py-2 text-right">
                    {r.thresholdCurrency} {r.thresholdAmount.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.registeredAt ? new Date(r.registeredAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">{r.notes || '—'}</td>
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
