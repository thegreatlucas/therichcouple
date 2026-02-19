'use client';
// app/components/Header/index.tsx — Com dark mode toggle

import Link from 'next/link';
import ThemeToggle from '@/app/components/ThemeToggle';

interface HeaderProps {
  title: string;
  backHref?: string;
  action?: { label: string; href: string };
}

export default function Header({ title, backHref, action }: HeaderProps) {
  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      backgroundColor: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 52,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {backHref && (
          <Link href={backHref} style={{ textDecoration: 'none', color: 'var(--text3)', fontSize: 20, lineHeight: 1 }}>
            ←
          </Link>
        )}
        <span style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>{title}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {action && (
          <Link href={action.href} style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 18,
              color: 'var(--text3)',
            }}>
              {action.label}
            </button>
          </Link>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}