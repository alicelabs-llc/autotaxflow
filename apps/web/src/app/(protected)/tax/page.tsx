'use client';

import { FormEvent, useState } from 'react';
import { useUser } from '@/lib/auth';

interface LineItem {
  amount: number; // dollars
  reference: string;
  quantity: number;
  productType: string;
}

interface TaxBreakdownItem {
  jurisdiction?: { name?: string; country?: string; state?: string; city?: string };
  tax_rate?: number;
  tax_amount?: number;
  taxable_amount?: number;
  tax_name?: string;
}

interface CalcResult {
  id: string;
  currency: string;
  totalAmount: number;
  totalTax: number;
  taxBreakdown: TaxBreakdownItem[];
  lineItems: any[];
}

export default function TaxCalculatorPage() {
  const { token, currentOrg } = useUser();
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { amount: 100, reference: 'sku-001', quantity: 1, productType: 'SAAS_SUBSCRIPTION' },
  ]);
  const [address, setAddress] = useState({
    line1: '',
    city: '',
    state: 'CA',
    postalCode: '',
    country: 'US',
  });
  const [currency] = useState('USD');
  const [result, setResult] = useState<CalcResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calc = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token || !currentOrg) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${currentOrg.id}/tax/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          address,
          currency,
          lineItems: lineItems.map((li) => ({
            ...li,
            amount: Math.round(li.amount * 100), // to cents
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || err?.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as CalcResult;
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const addLine = () =>
    setLineItems([
      ...lineItems,
      { amount: 0, reference: `sku-${lineItems.length + 1}`, quantity: 1, productType: 'PHYSICAL_GOOD' },
    ]);

  const removeLine = (i: number) => setLineItems(lineItems.filter((_, idx) => idx !== i));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Tax Calculator</h1>
      <p className="text-slate-600 mb-6">
        Preview sales tax for a transaction using Stripe Tax (uses your connected Stripe account).
      </p>

      <form onSubmit={calc} className="space-y-6">
        <div className="bg-white rounded shadow p-4">
          <h2 className="font-semibold mb-3">Customer address</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Address line 1">
              <input
                type="text"
                value={address.line1}
                onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                className="border rounded px-2 py-1 w-full"
              />
            </Field>
            <Field label="City">
              <input
                type="text"
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
                className="border rounded px-2 py-1 w-full"
              />
            </Field>
            <Field label="State (2-letter)">
              <input
                type="text"
                maxLength={2}
                value={address.state}
                onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase() })}
                className="border rounded px-2 py-1 w-full"
              />
            </Field>
            <Field label="Postal code">
              <input
                type="text"
                value={address.postalCode}
                onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                className="border rounded px-2 py-1 w-full"
              />
            </Field>
            <Field label="Country (2-letter)">
              <input
                type="text"
                maxLength={2}
                value={address.country}
                onChange={(e) => setAddress({ ...address, country: e.target.value.toUpperCase() })}
                className="border rounded px-2 py-1 w-full"
              />
            </Field>
          </div>
        </div>

        <div className="bg-white rounded shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Line items</h2>
            <button
              type="button"
              onClick={addLine}
              className="text-sm bg-brand-600 text-white px-3 py-1 rounded"
            >
              + Add line
            </button>
          </div>
          <div className="space-y-2">
            {lineItems.map((li, i) => (
              <div key={i} className="grid grid-cols-5 gap-2 items-end">
                <Field label="Reference">
                  <input
                    type="text"
                    value={li.reference}
                    onChange={(e) => {
                      const copy = [...lineItems];
                      copy[i].reference = e.target.value;
                      setLineItems(copy);
                    }}
                    className="border rounded px-2 py-1 w-full"
                  />
                </Field>
                <Field label="Amount ($)">
                  <input
                    type="number"
                    step="0.01"
                    value={li.amount}
                    onChange={(e) => {
                      const copy = [...lineItems];
                      copy[i].amount = parseFloat(e.target.value) || 0;
                      setLineItems(copy);
                    }}
                    className="border rounded px-2 py-1 w-full"
                  />
                </Field>
                <Field label="Qty">
                  <input
                    type="number"
                    min={1}
                    value={li.quantity}
                    onChange={(e) => {
                      const copy = [...lineItems];
                      copy[i].quantity = parseInt(e.target.value) || 1;
                      setLineItems(copy);
                    }}
                    className="border rounded px-2 py-1 w-full"
                  />
                </Field>
                <Field label="Product type">
                  <select
                    value={li.productType}
                    onChange={(e) => {
                      const copy = [...lineItems];
                      copy[i].productType = e.target.value;
                      setLineItems(copy);
                    }}
                    className="border rounded px-2 py-1 w-full"
                  >
                    <option value="SAAS_SUBSCRIPTION">SaaS Subscription</option>
                    <option value="DIGITAL_GOOD">Digital Good</option>
                    <option value="PHYSICAL_GOOD">Physical Good</option>
                    <option value="SERVICE">Service</option>
                    <option value="MARKETPLACE_FACILITATOR_SALE">Marketplace Sale</option>
                  </select>
                </Field>
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="text-red-600 text-xs"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-brand-600 text-white px-6 py-2 rounded disabled:opacity-50"
          >
            {loading ? 'Calculating…' : 'Calculate tax'}
          </button>
          {error && <span className="text-red-600 text-sm">{error}</span>}
        </div>
      </form>

      {result && (
        <div className="mt-8 bg-white rounded shadow overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold">Calculation result</h2>
            <div className="text-xs text-slate-500 mt-1">ID: {result.id}</div>
          </div>
          <div className="p-4 grid grid-cols-3 gap-4">
            <Stat label="Subtotal" value={`$${(result.totalAmount / 100).toFixed(2)}`} />
            <Stat label="Tax" value={`$${(result.totalTax / 100).toFixed(2)}`} accent="red" />
            <Stat
              label="Total"
              value={`$${((result.totalAmount + result.totalTax) / 100).toFixed(2)}`}
              accent="green"
            />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2">Jurisdiction</th>
                <th className="text-right px-4 py-2">Rate</th>
                <th className="text-right px-4 py-2">Taxable amount</th>
                <th className="text-right px-4 py-2">Tax amount</th>
              </tr>
            </thead>
            <tbody>
              {result.taxBreakdown.map((b, i) => {
                const juris = b.jurisdiction
                  ? `${b.jurisdiction.country || ''} ${b.jurisdiction.state || ''} ${b.jurisdiction.city || ''}`.trim() ||
                    b.tax_name ||
                    `Line ${i + 1}`
                  : b.tax_name || `Line ${i + 1}`;
                return (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-2">{juris}</td>
                    <td className="text-right px-4 py-2">
                      {((b.tax_rate || 0) * 100).toFixed(4)}%
                    </td>
                    <td className="text-right px-4 py-2">
                      ${((b.taxable_amount || 0) / 100).toFixed(2)}
                    </td>
                    <td className="text-right px-4 py-2">
                      ${((b.tax_amount || 0) / 100).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'red' | 'green';
}) {
  const color = accent === 'red' ? 'text-red-700' : accent === 'green' ? 'text-green-700' : 'text-slate-900';
  return (
    <div>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
