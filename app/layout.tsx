import type { Metadata } from 'next'
import './globals.css'
import SessionProviderWrapper from '@/components/SessionProviderWrapper'
import LaunchDarklyProvider from '@/components/LaunchDarklyProvider'

export const metadata: Metadata = {
  title: 'Summer Hoops App',
  description: 'App for managing our summer hoops games',
  generator: 'v0.dev + cursor',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <meta
        httpEquiv="Content-Security-Policy"
        content="connect-src 'self' https://*.launchdarkly.com https://pub.observability.app.launchdarkly.com https://otel.observability.app.launchdarkly.com; worker-src data: blob:;"
      />
      <body>
        <SessionProviderWrapper>
          <LaunchDarklyProvider>
            {children}
          </LaunchDarklyProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  )
}
