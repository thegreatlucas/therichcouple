import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { CryptoProvider } from '@/lib/cryptoContext';
import { ThemeProvider } from '@/lib/themeContext';
import { ToastProvider } from '@/app/components/Toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'The Rich Couple',
  description: 'Gerenciador financeiro do casal',
  manifest: '/manifest.json',
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

export const viewport: Viewport = {
  themeColor: '#2ecc71',
  width: 'device-width',
  initialScale: 1,
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
            <ToastProvider />
            {children}
          </CryptoProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}