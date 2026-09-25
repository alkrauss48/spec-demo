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
  // Next's built-in gzip stalled streamed RSC responses under concurrent load (seen with
  // Next 15.5 on Node 26): router.refresh() after an upload never finished rendering.
  // Compress at the reverse proxy instead.
  compress: false,
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
