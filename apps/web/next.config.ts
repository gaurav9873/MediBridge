import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,

  // @medibridge/ui ships TypeScript source rather than a build artefact, so
  // Next compiles it along with the app. Keeps the design system editable
  // without a watch task in between.
  transpilePackages: ['@medibridge/ui'],

  typedRoutes: true,

  experimental: {
    // Only pull the icons actually used, instead of the whole lucide bundle.
    optimizePackageImports: ['lucide-react'],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
}

export default config
