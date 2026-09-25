import type { NextConfig } from 'next';

const csp = [
  "default-src 'self'",
  "img-src 'self' blob:",
  // Next.js hydration uses inline scripts; dev mode also needs eval for fast refresh.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'sharp', 'heic-decode', 'libheif-js'],
  poweredByHeader: false,
  // Send <title> and other metadata in the initial HTML for every user agent, not streamed in
  // afterwards: every page needs its title from the first paint (WCAG 2.4.2, ui-routes.md).
  htmlLimitedBots: /.*/,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
