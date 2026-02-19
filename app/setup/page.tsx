'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';

const ACCOUNT_TYPES = [
  { value: 'checking', label: '🏦 Conta Corrente' },
  { value: 'savings', label: '💰 Poupança' },
  { value: 'credit', label: '💳 Cartão de Crédito' },
  { value: 'cash', label: '💵 Dinheiro' },
  { value: 'meal_voucher', label: '🍽️ Vale Refeição' },
  { value: 'food_voucher', label: '🛒 Vale Alimentação' },
  { value: 'investment', label: '📈 Investimento' },
  { value: 'other', label: '❓ Outro' },
];

const VOUCHER_TYPES = ['meal_voucher', 'food_voucher'];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', type: 'checking' });
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: member } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .single();

      if (!member) { router.push('/setup'); return; }
      setHouseholdId(member.household_id);
      await loadAccounts(member.household_id);
      setLoading(false);
    }
    init();
  }, []);

  async function loadAccounts(hid: string) {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('household_id', hid)
      .order('name');

    setAccounts(data || []);

    // Calcula saldo de cada conta:
    // Receitas vinculadas - Gastos vinculados
    if (data && data.length > 0) {
      const balanceMap: Record<string, number> = {};

      for (const acc of data) {
        // Receitas que creditam nessa conta
        const { data: incomeData } = await supabase
          .from('incomes')
          .select('amount')
          .eq('account_id', acc.id);

        const incomeTotal = (incomeData || []).reduce((s, i) => s + Number(i.amount), 0);

        // Gastos debitados dessa conta
        const { data: txData } = await supabase
          .from('transactions')
          .select('amount')
          .eq('account_id', acc.id);

        const txTotal = (txData || []).reduce((s, t) => s + Number(t.amount), 0);

        balanceMap[acc.id] = incomeTotal - txTotal;
      }

      setBalances(balanceMap);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: member } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .single();

    if (!member) return;

    const payload = {
      name: formData.name,
      type: formData.type,
      household_id: member.household_id,
      owner_id: user.id,
    };

    if (editingId) {
      const { error } = await supabase.from('accounts').update(payload).eq('id', editingId);
      if (error) { alert('Erro ao atualizar: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('accounts').insert(payload);
      if (error) { alert('Erro ao criar: ' + error.message); return; }
    }

    resetForm();
    await loadAccounts(member.household_id);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Deletar a conta "${name}"?`)) return;
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    if (error) { alert('Erro: ' + error.message); return; }
    if (householdId) loadAccounts(householdId);
  }

  function startEdit(account: any) {
    setEditingId(account.id);
    setFormData({ name: account.name, type: account.type || 'checking' });
    setShowForm(true);
  }

  function resetForm() {
    setEditingId(null);
    setFormData({ name: '', type: 'checking' });
    setShowForm(false);
  }

  function getTypeLabel(type: string) {
    return ACCOUNT_TYPES.find(t => t.value === type)?.label || type;
  }

  function getBalanceColor(balance: number, type: string) {
    if (balance < 0) return '#e74c3c';
    if (VOUCHER_TYPES.includes(type)) return '#f39c12';
    return '#2ecc71';
  }

  // Totais por categoria
  const cashAccounts = accounts.filter(a => !VOUCHER_TYPES.includes(a.type));
  const voucherAccounts = accounts.filter(a => VOUCHER_TYPES.includes(a.type));
  const totalCash = cashAccounts.reduce((s, a) => s + (balances[a.id] || 0), 0);
  const totalVoucher = voucherAccounts.reduce((s, a) => s + (balances[a.id] || 0), 0);

  if (loading) return <main style={{ padding: 16 }}>Carregando...</main>;

  return (
    <>
      <Header title="Contas" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1>🏦 Contas</h1>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          style={{ padding: '8px 16px', fontSize: 16, backgroundColor: showForm ? '#e74c3c' : '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          {showForm ? '✖️ Cancelar' : '➕ Nova conta'}
        </button>
      </div>

      {/* Resumo de saldos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: 'linear-gradient(135deg, #2ecc71, #27ae60)', padding: 16, borderRadius: 12, color: 'white' }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>Saldo total (dinheiro)</div>
          <div style={{ fontSize: 22, fontWeight: 'bold' }}>R$ {totalCash.toFixed(2)}</div>
        </div>
        {totalVoucher > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #f39c12, #e67e22)', padding: 16, borderRadius: 12, color: 'white' }}>
            <div style={{ fontSize: 12, opacity: 0.9 }}>Saldo VR/VA</div>
            <div style={{ fontSize: 22, fontWeight: 'bold' }}>R$ {totalVoucher.toFixed(2)}</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>Uso restrito alimentação</div>
          </div>
        )}
      </div>

      {/* Formulário */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ backgroundColor: '#f5f5f5', padding: 20, borderRadius: 8, marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Editar Conta' : 'Nova Conta'}</h3>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Nome:</label>
            <input
              type="text" value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Nubank, VR Ticket, Bradesco..."
              style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }}
              required
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Tipo:</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
              {ACCOUNT_TYPES.map((t) => (
                <button key={t.value} type="button"
                  onClick={() => setFormData({ ...formData, type: t.value })}
                  style={{
                    padding: 10,
                    border: formData.type === t.value ? '2px solid #3498db' : '1px solid #ddd',
                    borderRadius: 8,
                    backgroundColor: formData.type === t.value
                      ? VOUCHER_TYPES.includes(t.value) ? '#fff3cd' : '#e3f2fd'
                      : 'white',
                    cursor: 'pointer',
                    fontWeight: formData.type === t.value ? 'bold' : 'normal',
                    fontSize: 13,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {VOUCHER_TYPES.includes(formData.type) && (
              <div style={{ marginTop: 8, backgroundColor: '#fff3cd', padding: 10, borderRadius: 6, fontSize: 13 }}>
                🍽️ Contas de vale têm saldo separado e só podem ser usadas para gastos de alimentação.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={{ padding: '10px 20px', fontSize: 16, backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              {editingId ? '💾 Salvar' : '➕ Criar'}
            </button>
            <button type="button" onClick={resetForm} style={{ padding: '10px 20px', fontSize: 16, backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Contas de dinheiro */}
      {cashAccounts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, color: '#666', marginBottom: 12 }}>💵 Contas bancárias</h2>
          {cashAccounts.map((acc) => {
            const balance = balances[acc.id] ?? 0;
            return (
              <div key={acc.id} style={{ border: '1px solid #ddd', padding: 16, marginBottom: 10, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: 17 }}>{acc.name}</div>
                  <div style={{ fontSize: 13, color: '#666' }}>{getTypeLabel(acc.type)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', fontSize: 18, color: getBalanceColor(balance, acc.type) }}>
                      R$ {balance.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 11, color: '#999' }}>saldo calculado</div>
                  </div>
                  <button onClick={() => startEdit(acc)}
                    style={{ padding: '8px 12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>✏️</button>
                  <button onClick={() => handleDelete(acc.id, acc.name)}
                    style={{ padding: '8px 12px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Contas de vale */}
      {voucherAccounts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, color: '#666', marginBottom: 12 }}>🍽️ Vale Refeição / Alimentação</h2>
          {voucherAccounts.map((acc) => {
            const balance = balances[acc.id] ?? 0;
            return (
              <div key={acc.id} style={{ border: '1px solid #f39c12', padding: 16, marginBottom: 10, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fffbf0' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: 17 }}>{acc.name}</div>
                  <div style={{ fontSize: 13, color: '#e67e22' }}>{getTypeLabel(acc.type)} · Uso restrito alimentação</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', fontSize: 18, color: balance < 0 ? '#e74c3c' : '#f39c12' }}>
                      R$ {balance.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 11, color: '#999' }}>saldo calculado</div>
                  </div>
                  <button onClick={() => startEdit(acc)}
                    style={{ padding: '8px 12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>✏️</button>
                  <button onClick={() => handleDelete(acc.id, acc.name)}
                    style={{ padding: '8px 12px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {accounts.length === 0 && (
        <p style={{ textAlign: 'center', color: '#666', padding: 32 }}>Nenhuma conta cadastrada ainda.</p>
      )}

      <div style={{ marginTop: 24 }}>
        <Link href="/dashboard">
          <button style={{ padding: '12px 24px', fontSize: 16 }}>⬅️ Voltar ao Dashboard</button>
        </Link>
      </div>
    </main>
  </>
  );
}