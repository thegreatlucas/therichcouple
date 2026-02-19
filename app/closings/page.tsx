'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';
import { formatCurrency } from '@/lib/format';
import { performMonthlyClosing, getPreviousMonth, getCurrentMonth, formatMonthLabel } from '@/lib/monthlyClosing';

export default function ClosingsPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [closings, setClosings] = useState<any[]>([]);
  const [closeMode, setCloseMode] = useState<'manual' | 'auto'>('manual');
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<'current' | 'previous'>('previous');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUserId(user.id);

    const { data: member } = await supabase
      .from('household_members')
      .select('household_id, households(close_mode)')
      .eq('user_id', user.id)
      .single();

    if (!member) { router.push('/setup'); return; }

    setHouseholdId(member.household_id);
    setCloseMode((member.households as any)?.close_mode || 'manual');

    await loadClosings(member.household_id);
    setLoading(false);
  }

  async function loadClosings(hid: string) {
    const { data } = await supabase
      .from('monthly_closings')
      .select('*')
      .eq('household_id', hid)
      .order('month', { ascending: false })
      .limit(24);
    setClosings(data || []);
  }

  async function handleClose() {
    if (!householdId || !userId) return;
    setClosing(true);
    setErrorMsg(null);

    const month = selectedMonth === 'previous' ? getPreviousMonth() : getCurrentMonth();

    try {
      const result = await performMonthlyClosing({ householdId, month, closedBy: userId });
      setSuccessMsg(`✅ Mês de ${formatMonthLabel(month)} fechado com sucesso!`);
      setShowConfirm(false);
      await loadClosings(householdId);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: any) {
      setErrorMsg('Erro ao fechar mês: ' + e.message);
    }

    setClosing(false);
  }

  if (loading) return (
    <>
      <Header title="📅 Fechamentos" action={{ label: '← Dashboard', href: '/dashboard' }} />
      <main style={{ padding: 16 }}><p style={{ color: '#999' }}>Carregando...</p></main>
    </>
  );

  const now = new Date();
  const prevMonth = getPreviousMonth();

  return (
    <>
      <Header title="📅 Fechamentos Mensais" action={{ label: '← Dashboard', href: '/dashboard' }} />
      <main style={{ padding: 16, maxWidth: 560, margin: '0 auto', paddingBottom: 60 }}>

        {successMsg && (
          <div style={{ backgroundColor: '#d4edda', border: '1px solid #b8dfc7', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#1a5e34', fontSize: 14 }}>
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div style={{ backgroundColor: '#fde8e8', border: '1px solid #f5c6cb', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#7b1a1a', fontSize: 14 }}>
            ❌ {errorMsg}
          </div>
        )}

        {/* Fechar mês — só para modo manual */}
        {closeMode === 'manual' && (
          <div style={{ border: '1px solid #eee', borderRadius: 14, padding: '20px 22px', marginBottom: 20, backgroundColor: '#fafafa' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>🖐️ Fechar mês manualmente</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 1.5 }}>
              Salva um snapshot de renda, gastos e acerto do casal. Pode refazer se precisar.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {(['previous', 'current'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedMonth(m)}
                  style={{
                    padding: '12px 10px', textAlign: 'center',
                    border: selectedMonth === m ? '2px solid #3498db' : '1px solid #ddd',
                    borderRadius: 10, cursor: 'pointer',
                    backgroundColor: selectedMonth === m ? '#eaf4fd' : 'white',
                    fontWeight: selectedMonth === m ? 600 : 400,
                    fontSize: 13,
                  }}
                >
                  {m === 'previous'
                    ? `${formatMonthLabel(prevMonth)}`
                    : `${formatMonthLabel(new Date())} (atual)`}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowConfirm(true)}
              style={{
                width: '100%', padding: '13px', border: 'none',
                borderRadius: 10, backgroundColor: '#3498db', color: 'white',
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}
            >
              📦 Fechar {selectedMonth === 'previous' ? formatMonthLabel(prevMonth) : 'mês atual'}
            </button>
          </div>
        )}

        {closeMode === 'auto' && (
          <div style={{ border: '1px solid #d4edda', borderRadius: 14, padding: '16px 22px', marginBottom: 20, backgroundColor: '#f0fff4' }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#27ae60' }}>⚡ Fechamento automático ativado</div>
            <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
              O app fecha o mês automaticamente no dia configurado.{' '}
              <Link href="/setup" style={{ color: '#3498db' }}>Alterar nas configurações →</Link>
            </div>
          </div>
        )}

        {/* Confirm modal */}
        {showConfirm && (
          <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
            <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, maxWidth: 360, width: '100%' }}>
              <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>📦</div>
              <h3 style={{ textAlign: 'center', margin: '0 0 10px' }}>Confirmar fechamento</h3>
              <p style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20, lineHeight: 1.5 }}>
                Fechar <strong>{formatMonthLabel(selectedMonth === 'previous' ? prevMonth : new Date())}</strong>?
                O snapshot será salvo e poderá ser visualizado no histórico.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  onClick={() => setShowConfirm(false)}
                  style={{ padding: '12px', border: '1px solid #ddd', borderRadius: 10, backgroundColor: 'white', cursor: 'pointer', color: '#888' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleClose}
                  disabled={closing}
                  style={{ padding: '12px', border: 'none', borderRadius: 10, backgroundColor: closing ? '#95a5a6' : '#2ecc71', color: 'white', fontWeight: 700, cursor: closing ? 'not-allowed' : 'pointer' }}
                >
                  {closing ? 'Fechando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Histórico */}
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>📚 Histórico de fechamentos</div>

        {closings.length === 0 ? (
          <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 24, textAlign: 'center', color: '#aaa', fontSize: 14 }}>
            Nenhum mês fechado ainda.
          </div>
        ) : (
          closings.map(c => {
            const monthDate = new Date(c.month + 'T12:00:00');
            const monthLabel = formatMonthLabel(monthDate);
            const isPositive = c.balance >= 0;
            return (
              <div
                key={c.id}
                style={{
                  border: '1px solid #eee', borderRadius: 12, padding: '16px 20px',
                  marginBottom: 12, backgroundColor: 'white',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, textTransform: 'capitalize' }}>{monthLabel}</div>
                    <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
                      Fechado em {new Date(c.closed_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <div style={{
                    fontWeight: 700, fontSize: 16,
                    color: isPositive ? '#27ae60' : '#e74c3c',
                  }}>
                    {isPositive ? '+' : ''}{formatCurrency(c.balance)}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div style={{ backgroundColor: '#f0fff4', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Renda</div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#27ae60', marginTop: 2 }}>{formatCurrency(c.total_income)}</div>
                  </div>
                  <div style={{ backgroundColor: '#fff8f8', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Gastos</div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#e74c3c', marginTop: 2 }}>{formatCurrency(c.total_expenses)}</div>
                  </div>
                  <div style={{ backgroundColor: '#fff3f0', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Acerto</div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#e67e22', marginTop: 2 }}>{formatCurrency(c.settlement_amount)}</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>
    </>
  );
}