/** @type {import('next').NextConfig} */

const { withSentryConfig } = require('@sentry/nextjs');

const isDev = process.env.NODE_ENV === 'development';

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
  // In dev, put the Turbopack cache on the fast WSL2 native ext4 filesystem
  // instead of the slow Windows NTFS mount at /mnt/c/. Avoids 9P protocol
  // overhead on every cache read/write during startup and HMR.
  ...(isDev && { distDir: '/tmp/eencyclopedia-next' }),
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
    serverComponentsExternalPackages: ['pdf-parse', '@huggingface/transformers', 'onnxruntime-node'],
    // instrumentationHook is enabled by default in Next 14.2+; the explicit
    // flag was the trigger for the duplicate Sentry init we just removed.
    outputFileTracingExcludes: {
      '*': [
        'node_modules/@huggingface/transformers/**',
        'node_modules/onnxruntime-node/**',
        'node_modules/onnxruntime-web/**',
        'node_modules/sharp/**',
      ],
    },
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
      const existing = config.externals ?? [];
      const arr = Array.isArray(existing) ? existing : [existing];
      config.externals = [...arr, 'onnxruntime-node', '@huggingface/transformers'];
    }
    return config;
  },
};

module.exports = isDev
  ? nextConfig
  : withSentryConfig(nextConfig, {
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
