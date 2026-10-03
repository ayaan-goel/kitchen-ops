import type { NextConfig } from 'next';

// The browser only talks to this origin. /api/* is proxied to the NestJS API so the session
// cookie is first-party and there is no CORS (ADR-004). No business logic lives in Next.js.
const apiUrl = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
