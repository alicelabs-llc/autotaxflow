/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxy /api al gateway Fastify para evitar CORS en dev
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${process.env.API_URL || 'http://localhost:3001'}/api/:path*` },
    ];
  },
};

module.exports = nextConfig;
