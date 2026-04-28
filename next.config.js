/** @type {import('next').NextConfig} */

// Pull Supabase project ref out of the URL to whitelist its storage host
// for next/image. Falls back to a permissive pattern at build-time only.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = (() => {
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return null;
  }
})();

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Larger body limits later, when we accept .kicad_sch uploads.
    serverActions: {
      bodySizeLimit: '5mb',
    },
    // pdf-parse loads test PDF files during its own require() initialisation.
    // Bundling it through webpack in a serverless/edge context makes that
    // path resolution fail with ENOENT. Externalising it tells Next.js to
    // leave it as a native Node.js require at runtime, which works correctly.
    serverComponentsExternalPackages: ['pdf-parse'],
  },
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: 'https',
            hostname: supabaseHost,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [];
  },
};

module.exports = nextConfig;
