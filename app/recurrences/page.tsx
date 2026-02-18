'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RecurrencesPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);

      const { data: member } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .single();

      if (!member) { router.push('/setup'); return; }
      setHouseholdId(member.household_id);
      await loadRules(member.household_id);
      setLoading(false);
    }
    init();
  }, []);

  async function loadRules(hid: string) {
    const { data } = await supabase
      .from('recurrence_rules')
      .select(`
        *,
        transactions(description, amount, categories(name, icon))
      `)
      .eq('household_id', hid)
      .eq('active', true)
      .order('next_date');

    setRules(data || []);

    // Conta quantas estão pendentes (next_date <= hoje)
    const today = new Date().toISOString().split('T')[0];
    const pending = (data || []).filter(r => r.next_date <= today);
    setPendingCount(pending.length);
  }

  // Gera as transações pendentes de todas as recorrências vencidas
  async function processRecurrences() {
    if (!householdId || !userId) return;
    setProcessing(true);

    const today = new Date().toISOString().split('T')[0];
    const pending = rules.filter(r => r.next_date <= today);

    for (const rule of pending) {
      const baseTx = rule.transactions;
      if (!baseTx) continue;

      // Cria a nova transação
      const { error: txError } = await supabase.from('transactions').insert({
        household_id: householdId,
        user_id: userId,
        payer_id: userId,
        amount: baseTx.amount,
        description: baseTx.description,
        date: rule.next_date,
        payment_method: 'cash',
        split: 'individual',
        is_recurring: true,
        category_id: baseTx.categories?.id || null,
      });

      if (txError) {
        console.error('Erro ao gerar transação:', txError);
        continue;
      }

      // Avança a próxima data
      const nextDate = new Date(rule.next_date + 'T12:00:00');
      if (rule.frequency === 'monthly') {
        nextDate.setMonth(nextDate.getMonth() + 1);
        // Mantém o dia original se definido
        if (rule.day_of_month) {
          nextDate.setDate(rule.day_of_month);
        }
      } else if (rule.frequency === 'weekly') {
        nextDate.setDate(nextDate.getDate() + 7);
      }

      await supabase
        .from('recurrence_rules')
        .update({ next_date: nextDate.toISOString().split('T')[0] })
        .eq('id', rule.id);
    }

    await loadRules(householdId);
    setProcessing(false);
    alert(`✅ ${pending.length} transação(ões) gerada(s) com sucesso!`);
  }

  async function toggleRule(id: string, active: boolean) {
    const { error } = await supabase
      .from('recurrence_rules')
      .update({ active: !active })
      .eq('id', id);
    if (error) { alert('Erro: ' + error.message); return; }
    if (householdId) loadRules(householdId);
  }

  async function deleteRule(id: string, description: string) {
    if (!confirm(`Desativar a recorrência "${description}"?`)) return;
    const { error } = await supabase.from('recurrence_rules').delete().eq('id', id);
    if (error) { alert('Erro: ' + error.message); return; }
    if (householdId) loadRules(householdId);
  }

  function getFrequencyLabel(freq: string) {
    switch (freq) {
      case 'monthly': return '📅 Mensal';
      case 'weekly': return '📆 Semanal';
      default: return freq;
    }
  }

  function getDaysUntilNext(nextDate: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next = new Date(nextDate + 'T12:00:00');
    const diff = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `⚠️ ${Math.abs(diff)} dias em atraso`;
    if (diff === 0) return '⚠️ Vence hoje';
    if (diff === 1) return 'Amanhã';
    return `Em ${diff} dias`;
  }

  if (loading) return <main style={{ padding: 16 }}>Carregando...</main>;

  return (
    <main style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1>🔁 Recorrências</h1>
      </div>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
        As recorrências são criadas automaticamente ao lançar uma transação como "recorrente". Aqui você pode visualizá-las e processar as pendentes.
      </p>

      {/* Botão de processar pendentes */}
      {pendingCount > 0 && (
        <div style={{ backgroundColor: '#fff3cd', border: '2px solid #ffc107', borderRadius: 12, padding: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>⚠️ {pendingCount} recorrência(s) pendente(s)</strong>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Clique para gerar as transações automaticamente</div>
          </div>
          <button
            onClick={processRecurrences}
            disabled={processing}
            style={{ padding: '10px 20px', backgroundColor: processing ? '#95a5a6' : '#f39c12', color: 'white', border: 'none', borderRadius: 8, cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
          >
            {processing ? '⏳ Processando...' : '▶️ Gerar transações'}
          </button>
        </div>
      )}

      {rules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#666' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔁</div>
          <h3>Nenhuma recorrência ativa</h3>
          <p>Ao lançar um gasto, marque "recorrente" para que ele apareça aqui automaticamente.</p>
          <Link href="/transactions/new">
            <button style={{ padding: '12px 24px', fontSize: 16, backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', marginTop: 8 }}>
              ➕ Lançar gasto recorrente
            </button>
          </Link>
        </div>
      ) : (
        rules.map((rule) => {
          const tx = rule.transactions;
          const isOverdue = rule.next_date <= new Date().toISOString().split('T')[0];

          return (
            <div
              key={rule.id}
              style={{
                border: isOverdue ? '2px solid #f39c12' : '1px solid #ddd',
                padding: 16,
                marginBottom: 12,
                borderRadius: 12,
                backgroundColor: isOverdue ? '#fffdf0' : 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 20 }}>{tx?.categories?.icon || '🔁'}</span>
                  <span style={{ fontWeight: 'bold', fontSize: 16 }}>{tx?.description || 'Sem descrição'}</span>
                </div>
                <div style={{ fontSize: 13, color: '#666' }}>
                  {getFrequencyLabel(rule.frequency)}
                  {rule.day_of_month ? ` · Todo dia ${rule.day_of_month}` : ''}
                  {tx?.categories?.name ? ` · ${tx.categories.name}` : ''}
                </div>
                <div style={{ fontSize: 13, marginTop: 4, color: isOverdue ? '#e67e22' : '#666' }}>
                  Próxima: {new Date(rule.next_date + 'T12:00:00').toLocaleDateString('pt-BR')} — {getDaysUntilNext(rule.next_date)}
                </div>
              </div>

              <div style={{ textAlign: 'right', minWidth: 100 }}>
                <div style={{ fontWeight: 'bold', fontSize: 18, color: '#e74c3c', marginBottom: 8 }}>
                  R$ {Number(tx?.amount || 0).toFixed(2)}
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => deleteRule(rule.id, tx?.description || '')}
                    style={{ padding: '6px 10px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}

      <div style={{ marginTop: 24 }}>
        <Link href="/dashboard">
          <button style={{ padding: '12px 24px', fontSize: 16 }}>⬅️ Voltar ao Dashboard</button>
        </Link>
      </div>
    </main>
  );
}