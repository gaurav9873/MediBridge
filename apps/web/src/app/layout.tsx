import { copy } from '@medibridge/copy'
import { ToastProvider, TooltipProvider } from '@medibridge/ui'
import type { Metadata, Viewport } from 'next'
import type * as React from 'react'
import { QueryProvider } from '@/lib/query-provider'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: copy.common.app.name,
    template: `%s · ${copy.common.app.name}`,
  },
  description: copy.common.app.tagline,
  applicationName: copy.common.app.name,
  manifest: '/manifest.webmanifest',
  // Makes the app installable and full-screen when added to a phone's home
  // screen — the PWA-ready groundwork, ahead of the native app.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: copy.common.app.name,
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Deliberately NOT maximumScale: 1 — blocking pinch-zoom locks out anyone
  // who needs to magnify text.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1f24' },
  ],
}

/**
 * Applies the saved theme before first paint.
 *
 * Runs synchronously in <head>, so a dark-mode user never sees a white flash
 * while React hydrates.
 */
function ThemeScript(): React.JSX.Element {
  const script = `
    try {
      var saved = localStorage.getItem('medibridge.theme');
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (saved === 'dark' || (!saved && prefersDark)) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  `
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        {/* Keyboard users land here first and can jump past the navigation. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-[--radius-md] focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>

        <QueryProvider>
          <TooltipProvider>
            {children}
            <ToastProvider />
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
