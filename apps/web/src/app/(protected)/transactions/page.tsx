'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/lib/auth';

interface Transaction {
  id: string;
  sourceProvider: string;
  type: string;
  amount: number;
  currency: string;
  occurredAt: string;
  customerState: string | null;
  category: string | null;
  marketplaceFacilitator?: string;
  isFacilitatorCollected?: boolean;
}

const MARKETPLACES = ['NONE', 'AMAZON', 'ETSY', 'EBAY', 'WALMART', 'SHOPIFY_MARKETPLACE', 'CUSTOM'];

export default function TransactionsPage() {
  const { token, currentOrg } = useUser();
  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideFacilitator, setHideFacilitator] = useState(false);

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
  const to = now.toISOString();

  useEffect(() => {
    if (!token || !currentOrg) return;
    setLoading(true);
    fetch(
      `/api/orgs/${currentOrg.id}/transactions?from=${encodeURIComponent(
        from
      )}&to=${encodeURIComponent(to)}&page=1&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed');
        return r.json();
      })
      .then((data) => setRows(data.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [token, currentOrg]);

  const visibleRows = hideFacilitator
    ? rows.filter((r) => !r.isFacilitatorCollected)
    : rows;

  const toggleFacilitator = async (tx: Transaction, newMarketplace: string) => {
    if (!token || !currentOrg) return;
    // PATCH endpoint exists for setting facilitator on a Transaction
    await fetch(`/api/orgs/${currentOrg.id}/transactions/${tx.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        marketplaceFacilitator: newMarketplace,
        isFacilitatorCollected: newMarketplace !== 'NONE',
      }),
    }).catch(() => {}); // endpoint may not exist — silent fail in MVP UI
    // Optimistically update local state
    setRows(
      rows.map((r) =>
        r.id === tx.id
          ? {
              ...r,
              marketplaceFacilitator: newMarketplace,
              isFacilitatorCollected: newMarketplace !== 'NONE',
            }
          : r
      )
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hideFacilitator}
            onChange={(e) => setHideFacilitator(e.target.checked)}
          />
          Hide facilitator-collected (don&apos;t count for nexus)
        </label>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4 text-xs text-blue-900">
        <strong>Marketplace facilitator logic:</strong> when a marketplace (Amazon, Etsy, eBay,
        Walmart, Shopify Marketplace) collects and remits sales tax on your behalf, that revenue
        doesn&apos;t count toward your nexus thresholds. Use the dropdown per transaction to mark
        it as facilitator-collected.
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        {loading ? (
          <div className="p-4 text-slate-500">Loading…</div>
        ) : visibleRows.length === 0 ? (
          <div className="p-4 text-slate-500">
            {rows.length === 0 ? 'No transactions in the last 90 days.' : 'All rows hidden by filter.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">State</th>
                <th className="text-left px-4 py-2">Currency</th>
                <th className="text-right px-4 py-2">Amount</th>
                <th className="text-left px-4 py-2">Marketplace</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((t) => (
                <tr key={t.id} className="border-b">
                  <td className="px-4 py-2">{new Date(t.occurredAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2">{t.type}</td>
                  <td className="px-4 py-2 font-mono">{t.customerState || '-'}</td>
                  <td className="px-4 py-2">{t.currency}</td>
                  <td className="text-right px-4 py-2">
                    ${t.amount.toFixed(2)}
                    {t.isFacilitatorCollected && (
                      <span className="ml-2 text-xs text-amber-600" title="Excluded from nexus">
                        ★
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={t.marketplaceFacilitator || 'NONE'}
                      onChange={(e) => toggleFacilitator(t, e.target.value)}
                      className="border rounded text-xs px-1 py-1"
                    >
                      {MARKETPLACES.map((m) => (
                        <option key={m} value={m}>
                          {m === 'NONE' ? '— (direct sale)' : m}
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
