'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  title: string;
  backHref?: string;
  action?: { label: string; href: string };
}

export default function Header({ title, backHref, action }: HeaderProps) {
  const router = useRouter();

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      backgroundColor: 'white',
      borderBottom: '1px solid #e5e7eb',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 52,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {backHref && (
          <Link href={backHref} style={{ textDecoration: 'none', color: '#555', fontSize: 20, lineHeight: 1 }}>
            ←
          </Link>
        )}
        <span style={{ fontWeight: 700, fontSize: 17, color: '#1a1a1a' }}>{title}</span>
      </div>

      {action && (
        <Link href={action.href} style={{ textDecoration: 'none' }}>
          <button style={{
            padding: '6px 12px',
            backgroundColor: 'transparent',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 18,
            color: '#555',
          }}>
            {action.label}
          </button>
        </Link>
      )}
    </header>
  );
}
