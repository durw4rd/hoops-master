import type { Metadata } from 'next'
import { Bangers, Permanent_Marker, Inter } from 'next/font/google'
import './globals.css'
import SessionProviderWrapper from '@/components/SessionProviderWrapper'
import LaunchDarklyProvider from '@/components/LaunchDarklyProvider'

const bangers = Bangers({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bangers',
  display: 'swap',
})

const permanentMarker = Permanent_Marker({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-permanent-marker',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

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
    <html lang="en" className={`${bangers.variable} ${permanentMarker.variable} ${inter.variable}`}>
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
