import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { CryptoProvider } from '@/lib/cryptoContext';
import { ThemeProvider } from '@/lib/themeContext';
import { ToastProvider } from '@/app/components/Toast';
import { FinanceGroupProvider } from '@/lib/financeGroupContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'The Rich Couple',
  description: 'Gerenciador financeiro do casal',
  manifest: '/manifest.json',
  // @ts-ignore — themeColor é válido em runtime mesmo sem tipagem no Next 13
  themeColor: '#2ecc71',
  viewport: 'width=device-width, initial-scale=1',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'The Rich Couple',
  },
  openGraph: {
    images: [{ url: 'https://bolt.new/static/og_default.png' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [{ url: 'https://bolt.new/static/og_default.png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Registra o Service Worker para PWA */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});})}`,
          }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <CryptoProvider>
            <FinanceGroupProvider>
              <ToastProvider />
              {children}
            </FinanceGroupProvider>
          </CryptoProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}