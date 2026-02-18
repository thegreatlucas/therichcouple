'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const HIDDEN_PATHS = ['/', '/login', '/setup'];

export default function BottomNav() {
  const pathname = usePathname();
  const [pendingRecurrences, setPendingRecurrences] = useState(0);
  const [hasBalance, setHasBalance] = useState(false);

  useEffect(() => {
    loadBadges();
  }, [pathname]); // recarrega quando muda de página

  async function loadBadges() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: member } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .single();

    if (!member) return;
    const hid = member.household_id;
    const today = new Date().toISOString().split('T')[0];

    // Recorrências pendentes
    const { data: rules } = await supabase
      .from('recurrence_rules')
      .select('id')
      .eq('household_id', hid)
      .eq('active', true)
      .lte('next_date', today);

    setPendingRecurrences((rules || []).length);

    // Saldo em aberto com parceiro
    const { data: balRows } = await supabase
      .from('balances')
      .select('amount')
      .eq('household_id', hid);

    const total = (balRows || []).reduce((s, r) => s + Number(r.amount), 0);
    setHasBalance(total > 0.01);
  }

  if (HIDDEN_PATHS.includes(pathname)) return null;

  const NAV_ITEMS = [
    {
      href: '/dashboard',
      label: 'Início',
      badge: 0,
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? '#2ecc71' : 'none'} stroke={active ? '#2ecc71' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      ),
    },
    {
      href: '/transactions',
      label: 'Gastos',
      badge: 0,
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#2ecc71' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
      ),
    },
    {
      href: '/transactions/new',
      label: 'Lançar',
      badge: 0,
      icon: null, // botão central
    },
    {
      href: '/budgets',
      label: 'Orçamento',
      badge: 0,
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#2ecc71' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      ),
    },
    {
      href: '/balances',
      label: 'Acerto',
      badge: hasBalance ? 1 : 0,
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#2ecc71' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
    },
  ];

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 64,
      backgroundColor: 'white',
      borderTop: '1px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {NAV_ITEMS.map(({ href, icon, label, badge }) => {
        // Botão central de lançar
        if (!icon) {
          return (
            <Link key={href} href={href} style={{ textDecoration: 'none' }}>
              <div style={{
                width: 54,
                height: 54,
                borderRadius: '50%',
                backgroundColor: '#2ecc71',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(46, 204, 113, 0.45)',
                marginBottom: 8,
                position: 'relative',
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {/* Badge de recorrências pendentes */}
                {pendingRecurrences > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    backgroundColor: '#e74c3c',
                    border: '2px solid white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    color: 'white',
                    fontWeight: 'bold',
                  }}>
                    {pendingRecurrences > 9 ? '9+' : pendingRecurrences}
                  </div>
                )}
              </div>
            </Link>
          );
        }

        const isActive =
          pathname === href ||
          (href !== '/dashboard' && pathname.startsWith(href));

        return (
          <Link key={href} href={href} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              minWidth: 52,
              paddingTop: 4,
              position: 'relative',
            }}>
              <div style={{ position: 'relative' }}>
                {icon(isActive)}
                {/* Badge ponto vermelho */}
                {badge > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: -3,
                    right: -3,
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    backgroundColor: '#e74c3c',
                    border: '1.5px solid white',
                  }} />
                )}
              </div>
              <span style={{
                fontSize: 10,
                color: isActive ? '#2ecc71' : '#9ca3af',
                fontWeight: isActive ? 700 : 400,
                letterSpacing: 0.2,
              }}>
                {label}
              </span>
              <div style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                backgroundColor: isActive ? '#2ecc71' : 'transparent',
                marginTop: 1,
              }} />
            </div>
          </Link>
        );
      })}
    </nav>
  );
}