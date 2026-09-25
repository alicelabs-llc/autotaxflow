import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import 'dotenv/config';
import { env } from './lib/env';
import authPlugin from './plugins/auth';
import tenancyPlugin from './plugins/tenancy';
import { stripeWebhookRoutes } from './routes/webhooks/stripe';
import { shopifyWebhookRoutes } from './routes/webhooks/shopify';
import { woocommerceWebhookRoutes } from './routes/webhooks/woocommerce';
import { bigcommerceWebhookRoutes } from './routes/webhooks/bigcommerce';
import { authRoutes } from './routes/auth';
import { orgRoutes, orgScopedRoutes } from './routes/orgs';
import { billingRoutes } from './routes/billing';
import { taxabilityRoutes } from './routes/taxability';
import { cpaRoutes } from './routes/cpa';
import { integrationsRoutes } from './routes/integrations';
import { ssoRoutes } from './routes/sso';

const fastify = Fastify({
  logger: {
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
    level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  },
  // No usar el parser JSON por defecto para la ruta de webhook;
  // registramos nuestro contentTypeParser dentro del plugin de stripe.
});

async function bootstrap() {
  // 1. Plugins globales ------------------------------------------------------
  await fastify.register(cors, {
    origin: env.WEB_ORIGIN, // configurable; nunca true en prod
    credentials: true,
  });
  await fastify.register(cookie, {
    secret: env.JWT_SECRET,
  });

  await fastify.register(authPlugin);
  await fastify.register(tenancyPlugin);

  // 2. Health ----------------------------------------------------------------
  fastify.get('/health', async () => ({
    status: 'OK',
    service: 'autotaxflow-api',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
  }));

  // 3. Rutas públicas --------------------------------------------------------
  await fastify.register(authRoutes, { prefix: '/api/auth' });

  // 4. Rutas de orgs — el sub-router scoped hereda :orgId
  await fastify.register(orgRoutes, { prefix: '/api/orgs' });
  await fastify.register(orgScopedRoutes, { prefix: '/api/orgs/:orgId' });

  // 5. Billing — Stripe Checkout + Customer Portal + billing webhook
  await fastify.register(billingRoutes, { prefix: '/api/billing' });

  // 6. Taxability matrix
  await fastify.register(taxabilityRoutes, { prefix: '/api/taxability' });

  // 6.5 CPA portal — multi-org view for CPA_READONLY role
  await fastify.register(cpaRoutes, { prefix: '/api/cpa' });

  // 6.6 Integrations OAuth flows (QBO)
  await fastify.register(integrationsRoutes, { prefix: '/api/integrations' });

  // 6.7 SSO/OIDC endpoints (Google Workspace, Microsoft Entra, generic OIDC)
  await fastify.register(ssoRoutes, { prefix: '/api/auth/sso' });

  // 7. Webhooks — Stripe + Shopify + WooCommerce + BigCommerce
  await fastify.register(stripeWebhookRoutes, { prefix: '/api/webhooks/stripe' });
  await fastify.register(shopifyWebhookRoutes, { prefix: '/api/webhooks/shopify' });
  await fastify.register(woocommerceWebhookRoutes, { prefix: '/api/webhooks/woocommerce' });
  await fastify.register(bigcommerceWebhookRoutes, { prefix: '/api/webhooks/bigcommerce' });

  // 6. Boot ------------------------------------------------------------------
  await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
  fastify.log.info(`🚀 AutoTaxFlow API listening on http://0.0.0.0:${env.PORT}`);
}

// Graceful shutdown -----------------------------------------------------------
async function shutdown(signal: string) {
  fastify.log.info({ signal }, 'Shutting down gracefully');
  await fastify.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

bootstrap().catch((err) => {
  console.error('=== FATAL BOOT ERROR ===');
  console.error('Message:', err?.message || String(err));
  console.error('Stack:', err?.stack || '<no stack>');
  console.error('=== END ===');

  // Start error-exposure HTTP server instead of exiting
  const http = require('http');
  const payload = JSON.stringify({
    status: 'BOOT_ERROR',
    message: err?.message || String(err),
    stack: err?.stack,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      REDIS_HOST: process.env.REDIS_HOST,
      DATABASE_URL_SET: !!process.env.DATABASE_URL,
      JWT_SECRET_SET: !!process.env.JWT_SECRET,
    },
  }, null, 2);
  const port = Number(process.env.PORT) || 3001;
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(payload);
  }).listen(port, '0.0.0.0', () => {
    console.error(`>>> Error server on ${port}`);
  });
});
