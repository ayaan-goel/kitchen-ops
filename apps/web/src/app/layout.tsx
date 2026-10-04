import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

// Self-hosted at build time by next/font (no runtime request to Google).
const body = Instrument_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const heading = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-heading', display: 'swap', weight: ['500', '600', '700'] });

export const metadata: Metadata = {
  title: { default: 'Fernleaf Kitchen Ops', template: '%s · Fernleaf Kitchen Ops' },
  description: 'Operations admin panel for Fernleaf Kitchen corporate meal programs.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1b3a46',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable}`}>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
