'use client';
// app/components/ThemeToggle/index.tsx

import { useTheme } from '@/lib/themeContext';

export default function ThemeToggle({ style }: { style?: React.CSSProperties }) {
  const { isDark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
      style={{
        background: 'none',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '5px 9px',
        cursor: 'pointer',
        fontSize: 16,
        lineHeight: 1,
        color: 'var(--text2)',
        ...style,
      }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}