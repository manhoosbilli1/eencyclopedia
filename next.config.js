/** @type {import('next').NextConfig} */

const { withSentryConfig } = require('@sentry/nextjs');

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
    serverActions: {
      bodySizeLimit: '5mb',
    },
    serverComponentsExternalPackages: ['pdf-parse', '@huggingface/transformers', 'onnxruntime-node'],
    instrumentationHook: true,
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
  webpack(config, { isServer }) {
    if (isServer) {
      // onnxruntime-node ships platform-specific .node binaries that webpack
      // cannot parse. Externalise them so Node.js loads them natively at runtime.
      const existing = config.externals ?? [];
      const arr = Array.isArray(existing) ? existing : [existing];
      config.externals = [...arr, 'onnxruntime-node', '@huggingface/transformers'];
    }
    return config;
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: 'capistor-technologies-fzco',
  project: 'sentry-claret-horizon',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
