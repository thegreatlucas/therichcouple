'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';
import { useEncryptedInsert } from '@/lib/useEncryptedInsert';

export default function FinancingsPage() {
  const [financings, setFinancings] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [intermediaries, setIntermediaries] = useState<Record<string, any[]>>({});
  const [showIntermediaryForm, setShowIntermediaryForm] = useState<string | null>(null);
  const [intermediaryForm, setIntermediaryForm] = useState({ amount: '', due_date: '' });
  const [formData, setFormData] = useState({
    name: '',
    total_amount: '',
    installment_amount: '',
    total_installments: '',
    paid_installments: '0',
    start_date: new Date().toISOString().split('T')[0],
    due_day: '',
    account_id: '',
  });
  const router = useRouter();
  const { encryptRecord } = useEncryptedInsert();

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
        loadFinancings(member.household_id),
        loadAccounts(member.household_id),
      ]);
      setLoading(false);
    }
    init();
  }, []);

  async function loadFinancings(hid: string) {
    const { data } = await supabase
      .from('financings')
      .select('*, accounts(name)')
      .eq('household_id', hid)
      .order('created_at', { ascending: false });
    setFinancings(data || []);
  }

  async function loadAccounts(hid: string) {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('household_id', hid)
      .order('name');
    setAccounts(data || []);
  }

  async function loadIntermediaries(financingId: string) {
    const { data } = await supabase
      .from('financing_intermediaries')
      .select('*')
      .eq('financing_id', financingId)
      .order('due_date');
    setIntermediaries(prev => ({ ...prev, [financingId]: data || [] }));
  }

  async function toggleExpanded(financingId: string) {
    if (expandedId === financingId) {
      setExpandedId(null);
    } else {
      setExpandedId(financingId);
      if (!intermediaries[financingId]) {
        await loadIntermediaries(financingId);
      }
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

    const base = {
      name: formData.name,
      total_amount: parseFloat(formData.total_amount),
      installment_amount: parseFloat(formData.installment_amount),
      total_installments: parseInt(formData.total_installments),
      paid_installments: parseInt(formData.paid_installments),
      start_date: formData.start_date,
      due_day: parseInt(formData.due_day),
      account_id: formData.account_id || null,
      household_id: member.household_id,
      owner_id: user.id,
    };

    const payload = await encryptRecord(base);

    if (editingId) {
      const { error } = await supabase.from('financings').update(payload).eq('id', editingId);
      if (error) { alert('Erro ao atualizar: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('financings').insert(payload);
      if (error) { alert('Erro ao criar: ' + error.message); return; }
    }

    resetForm();
    await loadFinancings(member.household_id);
  }

  async function handleAddIntermediary(financingId: string) {
    if (!intermediaryForm.amount || !intermediaryForm.due_date) {
      alert('Preencha o valor e a data.');
      return;
    }

    const { error } = await supabase.from('financing_intermediaries').insert({
      financing_id: financingId,
      amount: parseFloat(intermediaryForm.amount),
      due_date: intermediaryForm.due_date,
    });

    if (error) { alert('Erro ao adicionar intermediária: ' + error.message); return; }

    setIntermediaryForm({ amount: '', due_date: '' });
    setShowIntermediaryForm(null);
    await loadIntermediaries(financingId);
  }

  async function handlePayIntermediary(intermediary: any, financingId: string) {
    if (!confirm(`Marcar intermediária de R$ ${Number(intermediary.amount).toFixed(2)} como paga?`)) return;

    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase
      .from('financing_intermediaries')
      .update({ paid: true, paid_date: today })
      .eq('id', intermediary.id);

    if (error) { alert('Erro: ' + error.message); return; }

    if (userId && householdId && intermediary.financing_id) {
      const financing = financings.find(f => f.id === financingId);
      const txBase = {
        household_id: householdId,
        account_id: financing?.account_id || null,
        user_id: userId,
        payer_id: userId,
        amount: intermediary.amount,
        description: `${financing?.name || 'Financiamento'} — Intermediária`,
        date: today,
        payment_method: 'transfer',
        split: 'individual',
        is_recurring: false,
      };
      const txPayload = await encryptRecord(txBase);
      await supabase.from('transactions').insert(txPayload);
    }

    await loadIntermediaries(financingId);
  }

  async function handleDeleteIntermediary(id: string, financingId: string) {
    if (!confirm('Deletar esta intermediária?')) return;
    const { error } = await supabase.from('financing_intermediaries').delete().eq('id', id);
    if (error) { alert('Erro: ' + error.message); return; }
    await loadIntermediaries(financingId);
  }

  async function handlePayInstallment(financing: any) {
    if (!confirm(`Registrar pagamento da parcela ${financing.paid_installments + 1}/${financing.total_installments}?`)) return;

    const newPaid = financing.paid_installments + 1;
    const { error } = await supabase.from('financings').update({ paid_installments: newPaid }).eq('id', financing.id);
    if (error) { alert('Erro: ' + error.message); return; }

    if (userId && financing.account_id && householdId) {
      const txBase = {
        household_id: householdId,
        account_id: financing.account_id,
        user_id: userId,
        payer_id: userId,
        amount: financing.installment_amount,
        description: `${financing.name} — Parcela ${newPaid}/${financing.total_installments}`,
        date: new Date().toISOString().split('T')[0],
        payment_method: 'transfer',
        split: 'individual',
        is_recurring: true,
      };
      const txPayload = await encryptRecord(txBase);
      await supabase.from('transactions').insert(txPayload);
    }

    if (householdId) loadFinancings(householdId);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Deletar o financiamento "${name}"? Isso também apagará todas as intermediárias.`)) return;
    const { error } = await supabase.from('financings').delete().eq('id', id);
    if (error) { alert('Erro: ' + error.message); return; }
    if (householdId) loadFinancings(householdId);
  }

  function startEdit(f: any) {
    setEditingId(f.id);
    setFormData({
      name: f.name,
      total_amount: f.total_amount.toString(),
      installment_amount: f.installment_amount.toString(),
      total_installments: f.total_installments.toString(),
      paid_installments: f.paid_installments.toString(),
      start_date: f.start_date,
      due_day: f.due_day.toString(),
      account_id: f.account_id || '',
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setFormData({
      name: '',
      total_amount: '',
      installment_amount: '',
      total_installments: '',
      paid_installments: '0',
      start_date: new Date().toISOString().split('T')[0],
      due_day: '',
      account_id: '',
    });
    setShowForm(false);
  }

  function getProgress(paid: number, total: number) { return Math.round((paid / total) * 100); }
  function getRemainingAmount(f: any) { return (f.total_installments - f.paid_installments) * f.installment_amount; }
  function getNextDueDate(f: any) {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), f.due_day);
    if (next <= now) next.setMonth(next.getMonth() + 1);
    return next.toLocaleDateString('pt-BR');
  }
  function getIntermediaryStatus(intermediaries: any[]) {
    if (!intermediaries || intermediaries.length === 0) return null;
    const pending = intermediaries.filter(i => !i.paid);
    const total = intermediaries.reduce((sum, i) => sum + Number(i.amount), 0);
    const paid = intermediaries.filter(i => i.paid).reduce((sum, i) => sum + Number(i.amount), 0);
    return { pending: pending.length, total: intermediaries.length, totalAmount: total, paidAmount: paid };
  }

  if (loading) return <main style={{ padding: 16 }}>Carregando...</main>;

  return (
    <>
      <Header title="Financiamentos" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>🏦 Financiamentos</h1>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          style={{ padding: '8px 16px', fontSize: 16, backgroundColor: showForm ? '#e74c3c' : '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          {showForm ? '✖️ Cancelar' : '➕ Novo financiamento'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ backgroundColor: '#f5f5f5', padding: 20, borderRadius: 8, marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Editar Financiamento' : 'Novo Financiamento'}</h3>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Nome:</label>
            <input type="text" value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Apartamento Centro, Carro Onix..."
              style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Valor total:</label>
              <input type="number" value={formData.total_amount}
                onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                placeholder="0.00" step="0.01" min="0"
                style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }} required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Valor da parcela:</label>
              <input type="number" value={formData.installment_amount}
                onChange={(e) => setFormData({ ...formData, installment_amount: e.target.value })}
                placeholder="0.00" step="0.01" min="0"
                style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }} required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Total de parcelas:</label>
              <input type="number" value={formData.total_installments}
                onChange={(e) => setFormData({ ...formData, total_installments: e.target.value })}
                placeholder="Ex: 48" min="1"
                style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }} required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Já pagas:</label>
              <input type="number" value={formData.paid_installments}
                onChange={(e) => setFormData({ ...formData, paid_installments: e.target.value })}
                placeholder="0" min="0"
                style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Dia de vencimento:</label>
              <input type="number" value={formData.due_day}
                onChange={(e) => setFormData({ ...formData, due_day: e.target.value })}
                placeholder="Ex: 15" min="1" max="31"
                style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }} required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Data de início:</label>
              <input type="date" value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }} required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Conta de débito:</label>
              <select value={formData.account_id}
                onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }}>
                <option value="">Selecione uma conta...</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
          </div>

          {formData.total_amount && formData.installment_amount && formData.total_installments && (
            <div style={{ backgroundColor: '#e3f2fd', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
              <strong>📊 Resumo:</strong> Saldo devedor: <strong>R$ {((parseInt(formData.total_installments) - parseInt(formData.paid_installments || '0')) * parseFloat(formData.installment_amount || '0')).toFixed(2)}</strong>
              {' · '} Parcelas restantes: <strong>{parseInt(formData.total_installments) - parseInt(formData.paid_installments || '0')}</strong>
            </div>
          )}

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

      {financings.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#666', padding: 32 }}>Nenhum financiamento cadastrado ainda.</p>
      ) : (
        financings.map((f) => {
          const progress = getProgress(f.paid_installments, f.total_installments);
          const remaining = f.total_installments - f.paid_installments;
          const isFinished = remaining === 0;
          const isExpanded = expandedId === f.id;
          const inters = intermediaries[f.id] || [];
          const interStatus = getIntermediaryStatus(inters);

          return (
            <div key={f.id} style={{ border: '1px solid #ddd', marginBottom: 16, borderRadius: 12, backgroundColor: 'white', overflow: 'hidden' }}>
              <div style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: 20 }}>{f.name}</div>
                    <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                      {f.accounts?.name && `Débito em: ${f.accounts.name} · `}
                      Vence todo dia <strong>{f.due_day}</strong>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {isFinished ? (
                      <span style={{ backgroundColor: '#2ecc71', color: 'white', padding: '4px 10px', borderRadius: 20, fontSize: 13, fontWeight: 'bold' }}>✅ Quitado</span>
                    ) : (
                      <span style={{ backgroundColor: '#e74c3c', color: 'white', padding: '4px 10px', borderRadius: 20, fontSize: 13, fontWeight: 'bold' }}>
                        Próx: {getNextDueDate(f)}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>{f.paid_installments}/{f.total_installments} parcelas pagas</span>
                    <span>{progress}%</span>
                  </div>
                  <div style={{ backgroundColor: '#eee', borderRadius: 8, height: 10, overflow: 'hidden' }}>
                    <div style={{ backgroundColor: isFinished ? '#2ecc71' : '#3498db', height: '100%', width: `${progress}%`, borderRadius: 8 }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  <div style={{ backgroundColor: '#f8f9fa', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#666' }}>Parcela</div>
                    <div style={{ fontWeight: 'bold', color: '#e74c3c' }}>R$ {Number(f.installment_amount).toFixed(2)}</div>
                  </div>
                  <div style={{ backgroundColor: '#f8f9fa', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#666' }}>Saldo devedor</div>
                    <div style={{ fontWeight: 'bold', color: '#e74c3c' }}>R$ {getRemainingAmount(f).toFixed(2)}</div>
                  </div>
                  <div style={{ backgroundColor: '#f8f9fa', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#666' }}>Total</div>
                    <div style={{ fontWeight: 'bold' }}>R$ {Number(f.total_amount).toFixed(2)}</div>
                  </div>
                </div>

                {interStatus && (
                  <div style={{ marginBottom: 12, fontSize: 13, color: interStatus.pending > 0 ? '#e67e22' : '#2ecc71', fontWeight: 'bold' }}>
                    🏢 {interStatus.pending > 0 ? `${interStatus.pending} intermediária(s) pendente(s)` : 'Todas intermediárias pagas'}
                    {' · '}Total: R$ {interStatus.totalAmount.toFixed(2)}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!isFinished && (
                    <button onClick={() => handlePayInstallment(f)}
                      style={{ padding: '8px 16px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 }}>
                      💰 Pagar parcela {f.paid_installments + 1}
                    </button>
                  )}
                  <button onClick={() => toggleExpanded(f.id)}
                    style={{ padding: '8px 16px', backgroundColor: '#9b59b6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
                    🏢 {isExpanded ? 'Ocultar' : 'Ver'} intermediárias
                  </button>
                  <button onClick={() => startEdit(f)}
                    style={{ padding: '8px 12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                    ✏️ Editar
                  </button>
                  <button onClick={() => handleDelete(f.id, f.name)}
                    style={{ padding: '8px 12px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                    🗑️
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div style={{ borderTop: '1px solid #eee', backgroundColor: '#fafafa', padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0 }}>🏢 Intermediárias</h3>
                    <button
                      onClick={() => setShowIntermediaryForm(showIntermediaryForm === f.id ? null : f.id)}
                      style={{ padding: '6px 14px', backgroundColor: '#9b59b6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
                      {showIntermediaryForm === f.id ? '✖️ Cancelar' : '➕ Adicionar'}
                    </button>
                  </div>

                  {showIntermediaryForm === f.id && (
                    <div style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid #ddd' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 13 }}>Valor:</label>
                          <input type="number" value={intermediaryForm.amount}
                            onChange={(e) => setIntermediaryForm({ ...intermediaryForm, amount: e.target.value })}
                            placeholder="0.00" step="0.01" min="0"
                            style={{ width: '100%', padding: 8, fontSize: 14, borderRadius: 4, border: '1px solid #ccc' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 13 }}>Data de vencimento:</label>
                          <input type="date" value={intermediaryForm.due_date}
                            onChange={(e) => setIntermediaryForm({ ...intermediaryForm, due_date: e.target.value })}
                            style={{ width: '100%', padding: 8, fontSize: 14, borderRadius: 4, border: '1px solid #ccc' }} />
                        </div>
                        <button onClick={() => handleAddIntermediary(f.id)}
                          style={{ padding: '8px 16px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                          ➕ Salvar
                        </button>
                      </div>
                    </div>
                  )}

                  {inters.length === 0 ? (
                    <p style={{ color: '#666', fontSize: 14, textAlign: 'center', padding: 16 }}>Nenhuma intermediária cadastrada.</p>
                  ) : (
                    inters.map((inter) => {
                      const isOverdue = !inter.paid && inter.due_date < new Date().toISOString().split('T')[0];
                      return (
                        <div key={inter.id} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: 12, marginBottom: 8, borderRadius: 8,
                          backgroundColor: inter.paid ? '#f0fff4' : isOverdue ? '#fff5f5' : 'white',
                          border: `1px solid ${inter.paid ? '#2ecc71' : isOverdue ? '#e74c3c' : '#ddd'}`
                        }}>
                          <div>
                            <div style={{ fontWeight: 'bold', fontSize: 16, color: inter.paid ? '#2ecc71' : '#e74c3c' }}>
                              R$ {Number(inter.amount).toFixed(2)}
                            </div>
                            <div style={{ fontSize: 13, color: '#666' }}>
                              Vence: {new Date(inter.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                              {inter.paid && inter.paid_date && (
                                <span style={{ color: '#2ecc71', marginLeft: 8 }}>
                                  · Pago em {new Date(inter.paid_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </span>
                              )}
                              {isOverdue && <span style={{ color: '#e74c3c', marginLeft: 8, fontWeight: 'bold' }}>· VENCIDA</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {!inter.paid && (
                              <button onClick={() => handlePayIntermediary(inter, f.id)}
                                style={{ padding: '6px 12px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                                ✅ Pagar
                              </button>
                            )}
                            {inter.paid && <span style={{ fontSize: 12, color: '#2ecc71', fontWeight: 'bold', padding: '6px 0' }}>✅ Paga</span>}
                            <button onClick={() => handleDeleteIntermediary(inter.id, f.id)}
                              style={{ padding: '6px 10px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {inters.length > 0 && (
                    <div style={{ marginTop: 12, padding: 12, backgroundColor: '#e3f2fd', borderRadius: 8, fontSize: 13 }}>
                      <strong>Total intermediárias:</strong> R$ {inters.reduce((s, i) => s + Number(i.amount), 0).toFixed(2)}
                      {' · '}<strong>Pagas:</strong> R$ {inters.filter(i => i.paid).reduce((s, i) => s + Number(i.amount), 0).toFixed(2)}
                      {' · '}<strong>Pendentes:</strong> R$ {inters.filter(i => !i.paid).reduce((s, i) => s + Number(i.amount), 0).toFixed(2)}
                    </div>
                  )}
                </div>
              )}
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