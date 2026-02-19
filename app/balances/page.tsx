'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function BalancesPage() {
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ amount: number; iOwe: boolean } | null>(null);
  const [sharedTransactions, setSharedTransactions] = useState<any[]>([]);
  const [hasPartner, setHasPartner] = useState(false);
  // CORRIGIDO: nome real do parceiro em vez de 'Parceiro(a)' hardcoded
  const [partnerName, setPartnerName] = useState('Parceiro(a)');
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setCurrentUserId(user.id);

      const { data: member } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .single();

      if (!member) { router.push('/setup'); return; }
      setHouseholdId(member.household_id);
      await loadData(member.household_id, user.id);
      setLoading(false);
    }
    init();
  }, []);

  async function loadData(hid: string, uid: string) {
    // Verifica membros e busca nome do parceiro
    const { data: memberRows } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', hid);

    const userIds = (memberRows || []).map((m: any) => m.user_id);
    const hasP = userIds.length >= 2;
    setHasPartner(hasP);

    // CORRIGIDO: busca nome real do parceiro na tabela profiles
    const partnerUserId = userIds.find((id: string) => id !== uid);
    if (partnerUserId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', partnerUserId)
        .single();
      if (profile?.name) setPartnerName(profile.name);
    }

    // Busca saldo
    const { data: balRows } = await supabase
      .from('balances')
      .select('*')
      .eq('household_id', hid);

    let netAmount = 0;
    for (const row of balRows || []) {
      if (row.to_user_id === uid) {
        netAmount += Number(row.amount);
      } else if (row.from_user_id === uid) {
        netAmount -= Number(row.amount);
      }
    }

    if (Math.abs(netAmount) > 0.001) {
      setBalance({ amount: Math.abs(netAmount), iOwe: netAmount < 0 });
    } else {
      setBalance(null);
    }

    // Histórico de transações compartilhadas (últimas 30)
    const { data: txs } = await supabase
      .from('transactions')
      .select('*, categories(name, icon)')
      .eq('household_id', hid)
      .eq('split', 'shared')
      .order('date', { ascending: false })
      .limit(30);

    setSharedTransactions(txs || []);
  }

  async function settleBalance() {
    if (!householdId || !currentUserId) return;
    if (!confirm(`Confirmar acerto de contas? O saldo com ${partnerName} será zerado.`)) return;

    setSettling(true);

    // Zera todos os registros de balance do household
    await supabase.from('balances').delete().eq('household_id', householdId);

    await loadData(householdId, currentUserId);
    setSettling(false);
  }

  if (loading) return <main style={{ padding: 16 }}>Carregando...</main>;

  const isZeroed = !balance || balance.amount < 0.001;

  return (
    <main style={{ padding: 16, maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1>🤝 Acerto de contas</h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
          Saldo calculado com base nas despesas compartilhadas entre o casal.
        </p>
      </div>

      {!hasPartner ? (
        <div style={{ border: '1px solid #ddd', padding: 24, borderRadius: 12, textAlign: 'center', color: '#666' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👤</div>
          <h3>Nenhum parceiro(a) no household ainda</h3>
          <p style={{ marginBottom: 16 }}>Convide seu parceiro(a) pelo código de convite para usar o acerto de contas.</p>
          <Link href="/setup">
            <button style={{ padding: '10px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Ver código de convite
            </button>
          </Link>
        </div>
      ) : (
        <>
          {/* Card de saldo */}
          <div style={{
            padding: 28,
            borderRadius: 16,
            marginBottom: 28,
            textAlign: 'center',
            border: isZeroed ? '2px solid #2ecc71' : '2px solid #f39c12',
            backgroundColor: isZeroed ? '#f0fff4' : '#fffdf0',
          }}>
            {isZeroed ? (
              <>
                <div style={{ fontSize: 52 }}>🎉</div>
                <h2 style={{ color: '#27ae60', margin: '12px 0 4px' }}>Tudo zerado!</h2>
                <p style={{ color: '#666', fontSize: 14 }}>Você e {partnerName} estão quites.</p>
              </>
            ) : (
              <>
                <div style={{ fontSize: 40, marginBottom: 8 }}>
                  {balance?.iOwe ? '😬' : '💰'}
                </div>
                <div style={{ fontSize: 15, color: '#666', marginBottom: 8 }}>
                  {balance?.iOwe
                    ? `Você deve para ${partnerName}`
                    : `${partnerName} deve para você`}
                </div>
                <div style={{ fontSize: 40, fontWeight: 'bold', color: balance?.iOwe ? '#e74c3c' : '#27ae60', marginBottom: 20 }}>
                  R$ {balance?.amount.toFixed(2)}
                </div>
                <button
                  onClick={settleBalance}
                  disabled={settling}
                  style={{
                    padding: '12px 32px',
                    backgroundColor: settling ? '#95a5a6' : '#2ecc71',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    cursor: settling ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    fontSize: 15,
                  }}
                >
                  {settling ? '⏳ Registrando...' : '✅ Marcar acerto como feito'}
                </button>
                <p style={{ fontSize: 12, color: '#999', marginTop: 10 }}>
                  Faça a transferência fora do app e clique acima para zerar o saldo.
                </p>
              </>
            )}
          </div>

          {/* Histórico de transações compartilhadas */}
          <div>
            <h3 style={{ marginBottom: 16 }}>📋 Despesas compartilhadas recentes</h3>
            {sharedTransactions.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#666', border: '1px solid #ddd', borderRadius: 12 }}>
                <p style={{ marginBottom: 12 }}>Nenhuma despesa compartilhada ainda.</p>
                <Link href="/transactions/new">
                  <button style={{ padding: '10px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                    ➕ Lançar despesa compartilhada
                  </button>
                </Link>
              </div>
            ) : (
              <div style={{ border: '1px solid #ddd', borderRadius: 12, overflow: 'hidden' }}>
                {sharedTransactions.map((tx, i) => {
                  const isPayer = tx.payer_id === currentUserId;
                  const half = Number(tx.amount) / 2;
                  return (
                    <div
                      key={tx.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 16px',
                        borderBottom: i < sharedTransactions.length - 1 ? '1px solid #f0f0f0' : 'none',
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span>{tx.categories?.icon || '💸'}</span>
                          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tx.description}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#999' }}>
                          {new Date(tx.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                          {tx.categories?.name ? ` · ${tx.categories.name}` : ''}
                          {' · '}
                          <span style={{ color: isPayer ? '#27ae60' : '#e67e22' }}>
                            {isPayer ? '💳 Você pagou' : `💳 ${partnerName} pagou`}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 'bold', color: '#333' }}>
                          R$ {Number(tx.amount).toFixed(2)}
                        </div>
                        <div style={{ fontSize: 12, color: isPayer ? '#27ae60' : '#e74c3c', marginTop: 2 }}>
                          {isPayer ? `+R$ ${half.toFixed(2)}` : `-R$ ${half.toFixed(2)}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ marginTop: 32 }}>
        <Link href="/dashboard">
          <button style={{ padding: '12px 24px', fontSize: 15 }}>⬅️ Voltar ao Dashboard</button>
        </Link>
      </div>
    </main>
  );
}