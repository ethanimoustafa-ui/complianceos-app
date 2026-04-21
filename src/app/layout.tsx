import type { Metadata } from 'next'
import './globals.css'
import { LanguageProvider } from '@/i18n'
import { DemoReset } from '@/components/DemoReset'

export const metadata: Metadata = {
  title: 'ComplianceOS - Governance, Risk & Compliance Platform',
  description: 'Enterprise GRC platform for financial institutions in Saudi Arabia',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Noto+Sans+Arabic:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <LanguageProvider>
          <DemoReset>{children}</DemoReset>
        </LanguageProvider>
      </body>
    </html>
  )
}
