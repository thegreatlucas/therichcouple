import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { CryptoProvider } from '@/lib/cryptoContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'The Rich Couple',
  description: 'Gerenciador financeiro do casal',
  openGraph: {
    images: [{ url: 'https://bolt.new/static/og_default.png' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [{ url: 'https://bolt.new/static/og_default.png' }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <CryptoProvider>
          {children}
        </CryptoProvider>
      </body>
    </html>
  );
}