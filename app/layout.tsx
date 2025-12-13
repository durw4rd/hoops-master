import type { Metadata } from 'next'
import './globals.css'
import SessionProviderWrapper from '@/components/SessionProviderWrapper'
import LaunchDarklyProvider from '@/components/LaunchDarklyProvider'

export const metadata: Metadata = {
  title: 'Hoops Master',
  description: 'Organize sports events, manage groups, and coordinate with your team',
  generator: 'v0.dev + cursor',
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
