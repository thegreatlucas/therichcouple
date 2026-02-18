'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';

const INCOME_TYPES = [
  { value: 'salary', label: '💼 Salário' },
  { value: 'vr', label: '🍽️ Vale Refeição' },
  { value: 'va', label: '🛒 Vale Alimentação' },
  { value: 'freelance', label: '💻 Freelance' },
  { value: 'bonus', label: '🎯 Bônus' },
  { value: 'investment', label: '📈 Rendimento' },
  { value: 'other', label: '❓ Outro' },
];

const RECURRENCE_OPTIONS = [
  { value: 'monthly', label: '📅 Todo mês' },
  { value: 'once', label: '1️⃣ Único' },
];

// Tipos que devem obrigatoriamente vincular a uma conta separada
const VOUCHER_TYPES = ['vr', 'va'];

export default function IncomesPage() {
  const [incomes, setIncomes] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [totalMonthly, setTotalMonthly] = useState(0);
  const [totalVoucher, setTotalVoucher] = useState(0);
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'salary',
    recurrence: 'monthly',
    month: new Date().toISOString().slice(0, 7),
    account_id: '',
  });
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

      await Promise.all([
        loadIncomes(member.household_id, user.id),
        loadAccounts(member.household_id),
      ]);
      setLoading(false);
    }
    init();
  }, []);

  async function loadIncomes(hid: string, uid: string) {
    const { data } = await supabase
      .from('incomes')
      .select('*, accounts(name, type)')
      .eq('household_id', hid)
      .order('month', { ascending: false });

    setIncomes(data || []);

    // Separa receitas normais de vouchers
    const monthly = (data || [])
      .filter(i => i.recurrence === 'monthly' && !VOUCHER_TYPES.includes(i.type))
      .reduce((sum, i) => sum + Number(i.amount), 0);

    const voucher = (data || [])
      .filter(i => i.recurrence === 'monthly' && VOUCHER_TYPES.includes(i.type))
      .reduce((sum, i) => sum + Number(i.amount), 0);

    setTotalMonthly(monthly);
    setTotalVoucher(voucher);
  }

  async function loadAccounts(hid: string) {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('household_id', hid)
      .order('name');
    setAccounts(data || []);
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

    // Valida que vouchers têm conta vinculada
    if (VOUCHER_TYPES.includes(formData.type) && !formData.account_id) {
      alert('Vale Refeição/Alimentação precisa estar vinculado a uma conta. Crie uma conta do tipo "Vale Refeição" primeiro.');
      return;
    }

    const payload = {
      household_id: member.household_id,
      user_id: user.id,
      description: formData.description,
      amount: parseFloat(formData.amount),
      type: formData.type,
      recurrence: formData.recurrence,
      month: formData.month + '-01',
      account_id: formData.account_id || null,
    };

    if (editingId) {
      const { error } = await supabase.from('incomes').update(payload).eq('id', editingId);
      if (error) { alert('Erro ao atualizar: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('incomes').insert(payload);
      if (error) { alert('Erro ao criar: ' + error.message); return; }
    }

    resetForm();
    await loadIncomes(member.household_id, user.id);
  }

  async function handleDelete(id: string, description: string) {
    if (!confirm(`Deletar "${description}"?`)) return;
    const { error } = await supabase.from('incomes').delete().eq('id', id);
    if (error) { alert('Erro: ' + error.message); return; }
    if (householdId && userId) loadIncomes(householdId, userId);
  }

  function startEdit(income: any) {
    setEditingId(income.id);
    setFormData({
      description: income.description,
      amount: income.amount.toString(),
      type: income.type,
      recurrence: income.recurrence,
      month: income.month.slice(0, 7),
      account_id: income.account_id || '',
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setFormData({
      description: '',
      amount: '',
      type: 'salary',
      recurrence: 'monthly',
      month: new Date().toISOString().slice(0, 7),
      account_id: '',
    });
    setShowForm(false);
  }

  function getTypeLabel(type: string) {
    return INCOME_TYPES.find(t => t.value === type)?.label || type;
  }

  const isVoucherType = VOUCHER_TYPES.includes(formData.type);

  // Agrupa por mês
  const grouped = incomes.reduce((acc, income) => {
    const month = income.month.slice(0, 7);
    if (!acc[month]) acc[month] = [];
    acc[month].push(income);
    return acc;
  }, {} as Record<string, any[]>);

  const monthKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  if (loading) return <main style={{ padding: 16 }}>Carregando...</main>;

  return (
    <>
      <Header title="Renda" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1>💰 Receitas</h1>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          style={{ padding: '8px 16px', fontSize: 16, backgroundColor: showForm ? '#e74c3c' : '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          {showForm ? '✖️ Cancelar' : '➕ Nova receita'}
        </button>
      </div>

      {/* Resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: 'linear-gradient(135deg, #2ecc71, #27ae60)', padding: 16, borderRadius: 12, color: 'white' }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>Renda mensal (dinheiro)</div>
          <div style={{ fontSize: 22, fontWeight: 'bold' }}>R$ {totalMonthly.toFixed(2)}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #f39c12, #e67e22)', padding: 16, borderRadius: 12, color: 'white' }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>Vale Refeição/Alimentação</div>
          <div style={{ fontSize: 22, fontWeight: 'bold' }}>R$ {totalVoucher.toFixed(2)}</div>
          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>Saldo separado</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #3498db, #2980b9)', padding: 16, borderRadius: 12, color: 'white' }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>Total de lançamentos</div>
          <div style={{ fontSize: 22, fontWeight: 'bold' }}>{incomes.length}</div>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ backgroundColor: '#f5f5f5', padding: 20, borderRadius: 8, marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Editar Receita' : 'Nova Receita'}</h3>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Descrição:</label>
            <input
              type="text" value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ex: Salário CLT, VR Empresa X..."
              style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Valor:</label>
              <input
                type="number" value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00" step="0.01" min="0"
                style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Mês de referência:</label>
              <input
                type="month" value={formData.month}
                onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }}
                required
              />
            </div>
          </div>

          {/* Tipo */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Tipo:</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
              {INCOME_TYPES.map((t) => (
                <button key={t.value} type="button"
                  onClick={() => setFormData({ ...formData, type: t.value, account_id: '' })}
                  style={{ padding: 10, border: formData.type === t.value ? '2px solid #2ecc71' : '1px solid #ddd', borderRadius: 8, backgroundColor: formData.type === t.value ? '#e8f8f0' : 'white', cursor: 'pointer', fontWeight: formData.type === t.value ? 'bold' : 'normal', fontSize: 13 }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conta vinculada — obrigatória para VR/VA, opcional para outros */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              {isVoucherType ? '🏦 Conta do vale (obrigatório):' : '🏦 Creditar em conta (opcional):'}
            </label>
            {isVoucherType && (
              <div style={{ backgroundColor: '#fff3cd', padding: 10, borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
                ⚠️ VR/VA são saldos separados. Vincule a uma conta do tipo "Vale Refeição" para controlar o saldo corretamente.
                {accounts.filter(a => a.type === 'meal_voucher' || a.type === 'food_voucher').length === 0 && (
                  <span> <Link href="/accounts" style={{ color: '#3498db' }}>Criar conta VR →</Link></span>
                )}
              </div>
            )}
            <select
              value={formData.account_id}
              onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
              style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: `1px solid ${isVoucherType && !formData.account_id ? '#e74c3c' : '#ccc'}` }}
              required={isVoucherType}
            >
              <option value="">{isVoucherType ? 'Selecione a conta do vale...' : 'Nenhuma (não vincular)'}</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.name} ({acc.type})</option>
              ))}
            </select>
          </div>

          {/* Recorrência */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Recorrência:</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {RECURRENCE_OPTIONS.map((r) => (
                <button key={r.value} type="button"
                  onClick={() => setFormData({ ...formData, recurrence: r.value })}
                  style={{ padding: 12, border: formData.recurrence === r.value ? '2px solid #2ecc71' : '1px solid #ddd', borderRadius: 8, backgroundColor: formData.recurrence === r.value ? '#e8f8f0' : 'white', cursor: 'pointer', fontWeight: formData.recurrence === r.value ? 'bold' : 'normal' }}
                >
                  {r.label}
                </button>
              ))}
            </div>
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

      {/* Lista agrupada por mês */}
      {incomes.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#666', padding: 32 }}>Nenhuma receita cadastrada ainda.</p>
      ) : (
        monthKeys.map((monthKey) => {
          const monthIncomes = grouped[monthKey];
          const monthCash = monthIncomes.filter((i: any) => !VOUCHER_TYPES.includes(i.type)).reduce((s: number, i: any) => s + Number(i.amount), 0);
          const monthVoucher = monthIncomes.filter((i: any) => VOUCHER_TYPES.includes(i.type)).reduce((s: number, i: any) => s + Number(i.amount), 0);
          const monthLabel = new Date(monthKey + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

          return (
            <div key={monthKey} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: '2px solid #eee' }}>
                <h3 style={{ margin: 0, textTransform: 'capitalize' }}>{monthLabel}</h3>
                <div style={{ textAlign: 'right' }}>
                  {monthCash > 0 && <div style={{ color: '#2ecc71', fontWeight: 'bold', fontSize: 14 }}>💵 R$ {monthCash.toFixed(2)}</div>}
                  {monthVoucher > 0 && <div style={{ color: '#f39c12', fontWeight: 'bold', fontSize: 14 }}>🍽️ R$ {monthVoucher.toFixed(2)}</div>}
                </div>
              </div>

              {monthIncomes.map((income: any) => (
                <div key={income.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: 12, marginBottom: 8, borderRadius: 8,
                  backgroundColor: VOUCHER_TYPES.includes(income.type) ? '#fffbf0' : 'white',
                  border: `1px solid ${VOUCHER_TYPES.includes(income.type) ? '#f39c12' : '#ddd'}`
                }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{income.description}</div>
                    <div style={{ fontSize: 13, color: '#666' }}>
                      {getTypeLabel(income.type)}
                      {income.recurrence === 'monthly' && <span style={{ marginLeft: 8, color: '#3498db' }}>· Mensal</span>}
                      {income.accounts?.name && <span style={{ marginLeft: 8, color: '#9b59b6' }}>· {income.accounts.name}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 16, color: VOUCHER_TYPES.includes(income.type) ? '#f39c12' : '#2ecc71' }}>
                      R$ {Number(income.amount).toFixed(2)}
                    </span>
                    <button onClick={() => startEdit(income)}
                      style={{ padding: '6px 10px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>✏️</button>
                    <button onClick={() => handleDelete(income.id, income.description)}
                      style={{ padding: '6px 10px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                  </div>
                </div>
              ))}
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
  </>
  );
}