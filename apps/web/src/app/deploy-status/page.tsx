import { Suspense } from 'react';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Inline the async content so the page itself stays a server component.
async function DeployStatus() {
  // Fetch config from the API to verify it's reachable from the web container
  let apiHealth: any = null;
  let apiHealthError: string | null = null;
  try {
    const apiUrl = process.env.API_URL || 'http://localhost:3001';
    const res = await fetch(`${apiUrl}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    apiHealth = await res.json();
  } catch (e) {
    apiHealthError = (e as Error).message;
  }

  const checks: Array<{ name: string; status: 'ok' | 'fail'; detail: string }> = [
    {
      name: 'Web container',
      status: 'ok',
      detail: `Next.js running — page rendered at ${new Date().toISOString()}`,
    },
    {
      name: 'API reachability',
      status: apiHealth ? 'ok' : 'fail',
      detail: apiHealth
        ? `${apiHealth.service} v${apiHealth.version} @ ${apiHealth.timestamp}`
        : `Could not reach API: ${apiHealthError}`,
    },
    {
      name: 'WEB_ORIGIN configured',
      status: process.env.WEB_ORIGIN || process.env.NEXT_PUBLIC_API_URL ? 'ok' : 'fail',
      detail:
        process.env.WEB_ORIGIN ||
        process.env.NEXT_PUBLIC_API_URL ||
        'WEB_ORIGIN env var not set (running locally)',
    },
    {
      name: 'NEXT_PUBLIC_API_URL configured',
      status: process.env.NEXT_PUBLIC_API_URL ? 'ok' : 'fail',
      detail: process.env.NEXT_PUBLIC_API_URL || 'not set — web app uses /api proxy',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-3xl px-4">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            AutoTaxFlow — Deploy Status
          </h1>
          <p className="text-slate-600 mt-2">
            Verification page for deployment at <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">atf.alicelabs.site</code>
          </p>
        </header>

        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <div className="px-4 py-3 border-b bg-slate-50">
            <h2 className="font-semibold">Build info</h2>
          </div>
          <div className="p-4 grid grid-cols-2 gap-4 text-sm">
            <Field label="Hostname" value={typeof window === 'undefined' ? 'server' : window.location.hostname} />
            <Field label="Rendered at" value={new Date().toISOString()} />
            <Field label="Node env" value={process.env.NODE_ENV || 'development'} />
            <Field label="Next.js runtime" value="nodejs (App Router)" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50">
            <h2 className="font-semibold">Connectivity checks</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2">Check</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.name} className="border-b last:border-b-0">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        c.status === 'ok'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {c.status === 'ok' ? '✓ OK' : '✗ FAIL'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600 text-xs break-all">{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
          <strong>Next steps:</strong>
          <ol className="list-decimal list-inside mt-2 space-y-1">
            <li>If API is unreachable, verify the <code>docker compose</code> stack is up: <code>docker compose ps</code></li>
            <li>If nginx returns 502, check <code>sudo nginx -t</code> + <code>sudo systemctl status nginx</code></li>
            <li>If TLS isn't issued yet, run <code>sudo certbot --nginx -d atf.alicelabs.site -d api.atf.alicelabs.site</code></li>
            <li>Smoke-test the full pipeline: register → create org → trigger Stripe test webhook</li>
          </ol>
        </div>

        <footer className="mt-8 text-xs text-slate-500 text-center">
          AutoTaxFlow v0.5.0 · Open source MIT · Built by AliceLabs LLC
        </footer>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="font-mono text-sm mt-1 break-all">{value}</div>
    </div>
  );
}

export default function DeployStatusPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center">Loading…</div>}>
      <DeployStatus />
    </Suspense>
  );
}
