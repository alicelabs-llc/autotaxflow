'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/auth';

export default function LandingPage() {
  const { ready, user } = useUser();
  const router = useRouter();

  // Authed users skip the landing — go straight to dashboard.
  useEffect(() => {
    if (ready && user) router.replace('/dashboard');
  }, [ready, user, router]);

  if (ready && user) return null;

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 to-white border-b">
        <div className="mx-auto max-w-7xl px-4 py-20 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-5xl font-bold text-slate-900 leading-tight">
              Avalara <span className="text-brand-600">for the rest of us.</span>
            </h1>
            <p className="mt-6 text-lg text-slate-600">
              Open-source, self-hostable sales tax nexus monitoring for US SMBs on Stripe.
              Know your nexus risk across all 50 states — without a sales call, without
              per-transaction fees, without Circular 230 overhead.
            </p>
            <div className="mt-8 flex gap-4">
              <Link
                href="/register"
                className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 rounded-md font-semibold"
              >
                Create free account
              </Link>
              <a
                href="https://github.com/alicelabs-llc/autotaxflow"
                target="_blank"
                rel="noreferrer"
                className="border border-slate-300 hover:border-slate-400 px-6 py-3 rounded-md font-semibold text-slate-700"
              >
                View on GitHub →
              </a>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Free tier · No credit card · Open source (MIT)
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-800 text-white text-xs font-mono px-4 py-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="ml-2 opacity-70">dashboard</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="border rounded p-3">
                  <div className="text-xs uppercase text-slate-500">Gross YTD</div>
                  <div className="text-xl font-bold">$487,210</div>
                </div>
                <div className="border rounded p-3">
                  <div className="text-xs uppercase text-slate-500">Net YTD</div>
                  <div className="text-xl font-bold">$478,032</div>
                </div>
                <div className="border rounded p-3">
                  <div className="text-xs uppercase text-slate-500">Transactions</div>
                  <div className="text-xl font-bold">3,421</div>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2">State</th>
                    <th className="text-right px-3 py-2">Gross</th>
                    <th className="text-left px-3 py-2">Nexus risk</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-mono">CA</td>
                    <td className="px-3 py-2 text-right">$182,403</td>
                    <td className="px-3 py-2 text-red-600">⚠ Likely nexus</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-mono">NY</td>
                    <td className="px-3 py-2 text-right">$94,210</td>
                    <td className="px-3 py-2 text-amber-600">→ approaching</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-mono">TX</td>
                    <td className="px-3 py-2 text-right">$61,029</td>
                    <td className="px-3 py-2 text-green-600">Below threshold</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-brand-700 text-white">
        <div className="mx-auto max-w-7xl px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <div className="text-3xl font-bold">50</div>
            <div className="text-sm opacity-80">US states tracked</div>
          </div>
          <div>
            <div className="text-3xl font-bold">$100K</div>
            <div className="text-sm opacity-80">Wayfair threshold</div>
          </div>
          <div>
            <div className="text-3xl font-bold">0.5%</div>
            <div className="text-sm opacity-80">vs Stripe Tax fee</div>
          </div>
          <div>
            <div className="text-3xl font-bold">MIT</div>
            <div className="text-sm opacity-80">Open-source license</div>
          </div>
        </div>
      </section>

      {/* Why AutoTaxFlow */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Why teams choose AutoTaxFlow</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <Feature
            title="No per-transaction fees"
            body="Stripe Tax charges 0.5% of every transaction. Avalara starts at $3,750/year. AutoTaxFlow is flat $79-$299/mo. At $5M ARR you save 92% vs Stripe Tax."
          />
          <Feature
            title="Open-source & self-hostable"
            body="Clone the repo, deploy on Hetzner $7/mo. No vendor lock-in, no black-box AI rules. The CPA who reviews your filing can read every line of the code that flagged the nexus."
          />
          <Feature
            title="Real-time aggregation"
            body="Stripe webhook → BullMQ → upserted StateRevenueDaily in <50ms. TaxJar and Quaderno batch nightly. When you cross a threshold, you know today, not tomorrow."
          />
          <Feature
            title="Multi-tenant from day 1"
            body="CPA firms get a single login to see all their client orgs. Avalara charges $400/extra per CPA portal user. AutoTaxFlow includes CPA role in Plan Business at no extra cost."
          />
          <Feature
            title="Not subject to Circular 230"
            body="We're data middleware + alerts, not tax software. No filings, no advice, no regulated practice exposure. Your CPA files the returns — we just hand them the data, clean."
          />
          <Feature
            title="Custom rules engine"
            body="Define your own nexus thresholds per state — useful for healthcare and fintech with conservative exposure tolerance. TaxJar's thresholds are hardcoded to state defaults."
          />
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-slate-50 border-t border-b py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-3xl font-bold text-center mb-4">Simple, transparent pricing</h2>
          <p className="text-center text-slate-600 mb-12">
            No sales call. No &quot;contact us&quot;. Cancel anytime via Stripe Customer Portal.
          </p>
          <div className="grid md:grid-cols-4 gap-6">
            <PricingCard
              name="Free"
              price="$0"
              tagline="Monitoring only"
              features={[
                '1 Stripe account',
                'Real-time nexus alerts',
                '1 custom rule',
                'No reports, no QBO, no CPA',
              ]}
              cta="Start free"
              href="/register"
            />
            <PricingCard
              name="Starter"
              price="$79"
              tagline="For freelancers & micro-SaaS"
              features={[
                '1 Stripe, CSV export',
                '3 nexus rules',
                'Email alerts',
                'Up to 3 members',
              ]}
              cta="Choose Starter"
              href="/register"
              highlighted
            />
            <PricingCard
              name="Pro"
              price="$149"
              tagline="For SMBs $500K–$2M"
              features={[
                '2 Stripe accounts',
                'QBO sync, PDF reports',
                '10 rules, expense categorization',
                'Up to 5 members',
              ]}
              cta="Choose Pro"
              href="/register"
            />
            <PricingCard
              name="Business"
              price="$299"
              tagline="For $2M+ revenue"
              features={[
                '10 Stripe accounts',
                'CPA role + API access',
                '50 rules, multi-currency',
                'Up to 5 members + CPA portal',
              ]}
              cta="Choose Business"
              href="/register"
            />
          </div>
          <p className="text-center text-slate-500 mt-8 text-sm">
            CPA firms: $49/org/month read-only plan.{' '}
            <a href="mailto:hello@autotaxflow.dev" className="text-brand-600">
              Get in touch →
            </a>
          </p>
        </div>
      </section>

      {/* Integrations */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Integrations</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Integration name="Stripe" status="✅ Live" />
          <Integration name="Shopify" status="✅ Live" />
          <Integration name="QuickBooks Online" status="🚧 In progress" />
          <Integration name="WooCommerce" status="📅 Roadmap" />
          <Integration name="BigCommerce" status="📅 Roadmap" />
          <Integration name="Amazon VCS" status="📅 Roadmap" />
          <Integration name="Recurly" status="📅 Roadmap" />
          <Integration name="Chargebee" status="📅 Roadmap" />
        </div>
      </section>

      {/* CTA */}
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Stop guessing where you have nexus.
          </h2>
          <p className="text-slate-300 mb-8 text-lg">
            Set up in 5 minutes. Free tier, no credit card, cancel anytime.
          </p>
          <Link
            href="/register"
            className="inline-block bg-brand-600 hover:bg-brand-700 text-white px-8 py-4 rounded-md font-semibold"
          >
            Create your free account →
          </Link>
        </div>
      </section>

      <footer className="border-t bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-8 grid md:grid-cols-4 gap-8 text-sm">
          <div>
            <div className="font-bold text-slate-900 mb-2">AutoTaxFlow</div>
            <p className="text-slate-600">
              Open-source sales tax nexus monitoring for US SMBs on Stripe.
            </p>
          </div>
          <div>
            <div className="font-semibold text-slate-900 mb-2">Product</div>
            <ul className="space-y-1 text-slate-600">
              <li>
                <Link href="/register" className="hover:text-brand-600">Sign up</Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-brand-600">Sign in</Link>
              </li>
              <li>
                <a href="#pricing" className="hover:text-brand-600">Pricing</a>
              </li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-slate-900 mb-2">Resources</div>
            <ul className="space-y-1 text-slate-600">
              <li>
                <a
                  href="https://github.com/alicelabs-llc/autotaxflow"
                  className="hover:text-brand-600"
                >
                  GitHub repo
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/alicelabs-llc/autotaxflow/tree/main/docs"
                  className="hover:text-brand-600"
                >
                  Architecture docs
                </a>
              </li>
              <li>
                <a
                  href="mailto:hello@autotaxflow.dev"
                  className="hover:text-brand-600"
                >
                  Contact sales
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-slate-900 mb-2">Legal</div>
            <ul className="space-y-1 text-slate-600">
              <li>MIT License</li>
              <li>Not tax advice · Not subject to IRS Circular 230</li>
              <li>
                <a href="mailto:security@alicelabs.dev" className="hover:text-brand-600">
                  Security disclosures
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="text-center text-xs text-slate-500 py-4 border-t">
          © 2025 AliceLabs LLC · Built with Fastify + Next.js + Prisma + BullMQ
        </div>
      </footer>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-slate-200 rounded-lg p-6 bg-white">
      <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-600 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function PricingCard({
  name,
  price,
  tagline,
  features,
  cta,
  href,
  highlighted,
}: {
  name: string;
  price: string;
  tagline: string;
  features: string[];
  cta: string;
  href: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`border rounded-lg p-6 bg-white ${
        highlighted ? 'border-brand-600 shadow-lg' : 'border-slate-200'
      }`}
    >
      {highlighted && (
        <div className="inline-block bg-brand-600 text-white text-xs px-2 py-1 rounded mb-3">
          Most popular
        </div>
      )}
      <div className="text-lg font-bold text-slate-900">{name}</div>
      <div className="text-3xl font-bold text-slate-900 mt-1">
        {price}
        <span className="text-base font-normal text-slate-500">/mo</span>
      </div>
      <div className="text-sm text-slate-500 mt-1">{tagline}</div>
      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="text-green-600">✓</span>
            {f}
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={`block mt-6 text-center py-2 rounded font-semibold ${
          highlighted
            ? 'bg-brand-600 hover:bg-brand-700 text-white'
            : 'border border-slate-300 hover:border-slate-400 text-slate-700'
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

function Integration({ name, status }: { name: string; status: string }) {
  return (
    <div className="border border-slate-200 rounded-lg p-4 text-center bg-white">
      <div className="font-semibold text-slate-900">{name}</div>
      <div className="text-xs text-slate-500 mt-1">{status}</div>
    </div>
  );
}
