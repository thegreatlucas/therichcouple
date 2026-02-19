'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Header from '@/app/components/Header';

type RecurrenceType = 'fixed' | 'variable';

const FIXED_EXAMPLES = ['Netflix', 'Spotify', 'Internet', 'Academia', 'Plano celular', 'iCloud', 'Disney+'];
const VARIABLE_EXAMPLES = ['Água', 'Luz', 'Energia', 'Gás', 'Condomínio'];

const emptyForm = {
  name: '',
  type: 'fixed' as RecurrenceType,
  amount: '',
  due_day: '1',
  category: '',
  notes: '',
  payment_method: 'pix' as 'pix' | 'boleto' | 'credit_card',
};

export default function RecurrencesPage() {
  const [recurrences, setRecurrences] = useState<any[]>([]);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RecurrenceType>('fixed');
  const [variableAmounts, setVariableAmounts] = useState<Record<string, string>>({});
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
      await loadRecurrences(member.household_id);
      setLoading(false);
    }
    init();
  }, []);

  async function loadRecurrences(hid: string) {
    const { data } = await supabase
      .from('recurrence_rules')
      .select('*')
      .eq('household_id', hid)
      .eq('active', true)
      .order('due_day');
    setRecurrences(data || []);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!householdId || !userId) return;

    const payload = {
      household_id: householdId,
      user_id: userId,
      name: formData.name.trim(),
      recurrence_type: formData.type,
      amount: formData.type === 'fixed' ? parseFloat(formData.amount) || 0 : null,
      due_day: parseInt(formData.due_day),
      category: formData.category.trim(),
      notes: formData.notes.trim(),
      payment_method: formData.payment_method,
      active: true,
      frequency: 'monthly',
      next_date: (() => {
        const today = new Date();
        const day = parseInt(formData.due_day);
        const d = new Date(today.getFullYear(), today.getMonth(), day);
        if (d <= today) d.setMonth(d.getMonth() + 1);
        return d.toISOString().split('T')[0];
      })(),
    };

    if (editingId) {
      await supabase.from('recurrence_rules').update(payload).eq('id', editingId);
    } else {
      await supabase.from('recurrence_rules').insert(payload);
    }

    resetForm();
    if (householdId) loadRecurrences(householdId);
  }

  async function saveVariableAmount(id: string) {
    const amount = parseFloat(variableAmounts[id]);
    if (!amount || isNaN(amount)) return;

    await supabase.from('recurrence_rules').update({
      last_variable_amount: amount,
      last_updated: new Date().toISOString().split('T')[0],
    }).eq('id', id);

    // Cria transação com o valor informado
    if (householdId && userId) {
      const rule = recurrences.find(r => r.id === id);
      await supabase.from('transactions').insert({
        household_id: householdId,
        user_id: userId,
        payer_id: userId,
        amount,
        description: rule?.name || 'Conta variável',
        date: new Date().toISOString().split('T')[0],
        payment_method: 'debit',
        split: 'shared',
        is_recurring: true,
      });
    }

    setVariableAmounts(prev => ({ ...prev, [id]: '' }));
    if (householdId) loadRecurrences(householdId);
    alert('✅ Valor lançado com sucesso!');
  }

  async function deleteRecurrence(id: string, name: string) {
    if (!confirm(`Remover a recorrência "${name}"?`)) return;
    await supabase.from('recurrence_rules').delete().eq('id', id);
    if (householdId) loadRecurrences(householdId);
  }

  function startEdit(r: any) {
    setFormData({
      name: r.name || '',
      type: r.recurrence_type || 'fixed',
      amount: r.amount?.toString() || '',
      due_day: r.due_day?.toString() || '1',
      category: r.category || '',
      notes: r.notes || '',
      payment_method: r.payment_method || 'pix',
    });
    setEditingId(r.id);
    setShowForm(true);
    setActiveTab(r.recurrence_type || 'fixed');
  }

  function resetForm() {
    setFormData(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  async function payNow(r: any) {
    if (!householdId || !userId) return;
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('transactions').insert({
      household_id: householdId,
      user_id: userId,
      payer_id: userId,
      amount: r.amount,
      description: r.name,
      date: today,
      payment_method: r.payment_method,
      split: 'shared',
      is_recurring: true,
    });
    if (error) { alert('Erro: ' + error.message); return; }
    alert(`✅ "${r.name}" marcado como pago!`);
  }

  function getDaysUntil(day: number) {
    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), day);
    let target = thisMonth;
    if (thisMonth <= today) {
      target = new Date(today.getFullYear(), today.getMonth() + 1, day);
    }
    const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return '⚠️ Vence hoje';
    if (diff === 1) return '⚠️ Amanhã';
    if (diff <= 5) return `⚠️ Em ${diff} dias`;
    return `Em ${diff} dias`;
  }

  const fixed = recurrences.filter(r => r.recurrence_type === 'fixed');
  const variable = recurrences.filter(r => r.recurrence_type === 'variable');
  const totalFixed = fixed.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  if (loading) return <main style={{ padding: 16 }}>Carregando...</main>;

  return (
    <>
      <Header title="Recorrências" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>

        {/* Resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div style={{ backgroundColor: '#f0f4ff', borderRadius: 12, padding: 16, border: '1px solid #dde' }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>📋 Assinaturas fixas</div>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: '#3498db' }}>R$ {totalFixed.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{fixed.length} ativas</div>
          </div>
          <div style={{ backgroundColor: '#f0fff4', borderRadius: 12, padding: 16, border: '1px solid #cec' }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>📊 Contas variáveis</div>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: '#2ecc71' }}>{variable.length} contas</div>
            <div style={{ fontSize: 12, color: '#999' }}>para lançar todo mês</div>
          </div>
        </div>

        {/* Alertas de vencimento para boleto/pix */}
        {(() => {
          const urgent = recurrences.filter(r =>
            (r.payment_method === 'pix' || r.payment_method === 'boleto') &&
            r.recurrence_type === 'fixed' &&
            (() => {
              const today = new Date();
              const thisMonth = new Date(today.getFullYear(), today.getMonth(), r.due_day);
              let target = thisMonth <= today ? new Date(today.getFullYear(), today.getMonth() + 1, r.due_day) : thisMonth;
              const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              return diff <= 7;
            })()
          );
          if (urgent.length === 0) return null;
          return (
            <div style={{ backgroundColor: '#fff3cd', border: '2px solid #ffc107', borderRadius: 12, padding: 14, marginBottom: 20 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 8 }}>⚠️ Vencimentos próximos</div>
              {urgent.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid #ffe69c' }}>
                  <span style={{ fontSize: 14 }}>
                    {r.payment_method === 'boleto' ? '📄' : '⚡'} Falta pagar <strong>{r.name}</strong> — vence dia {r.due_day}
                  </span>
                  <button onClick={() => payNow(r)} style={{ padding: '4px 12px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>
                    Pagar
                  </button>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Botão adicionar */}
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setFormData({ ...emptyForm, type: activeTab }); }}
            style={{ width: '100%', padding: '12px', marginBottom: 20, backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 'bold', fontSize: 15 }}
          >
            ➕ Nova recorrência
          </button>
        )}

        {/* Formulário */}
        {showForm && (
          <div style={{ border: '2px solid #3498db', borderRadius: 12, padding: 20, marginBottom: 24, backgroundColor: '#f8fbff' }}>
            <h3 style={{ margin: '0 0 16px' }}>{editingId ? '✏️ Editar' : '➕ Nova'} recorrência</h3>

            {/* Tipo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {(['fixed', 'variable'] as RecurrenceType[]).map(t => (
                <button key={t} type="button"
                  onClick={() => setFormData({ ...formData, type: t })}
                  style={{ padding: 12, border: formData.type === t ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 8, backgroundColor: formData.type === t ? '#e8f4ff' : 'white', cursor: 'pointer', fontWeight: formData.type === t ? 'bold' : 'normal' }}
                >
                  {t === 'fixed' ? '📋 Fixa (assinatura)' : '📊 Variável (água, luz)'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Nome:</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder={formData.type === 'fixed' ? 'Ex: Netflix, Spotify...' : 'Ex: Conta de luz, Água...'}
                  required style={{ width: '100%', padding: 10, fontSize: 15, borderRadius: 8, border: '1px solid #ddd' }}
                />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {(formData.type === 'fixed' ? FIXED_EXAMPLES : VARIABLE_EXAMPLES).map(ex => (
                    <button key={ex} type="button" onClick={() => setFormData({ ...formData, name: ex })}
                      style={{ padding: '3px 8px', fontSize: 12, backgroundColor: '#f0f0f0', border: '1px solid #ddd', borderRadius: 20, cursor: 'pointer' }}
                    >{ex}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                {formData.type === 'fixed' && (
                  <div>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Valor (R$):</label>
                    <input type="number" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00" step="0.01" min="0" required={formData.type === 'fixed'}
                      style={{ width: '100%', padding: 10, fontSize: 15, borderRadius: 8, border: '1px solid #ddd' }}
                    />
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Dia de vencimento:</label>
                  <select value={formData.due_day} onChange={e => setFormData({ ...formData, due_day: e.target.value })}
                    style={{ width: '100%', padding: 10, fontSize: 15, borderRadius: 8, border: '1px solid #ddd' }}
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>Dia {d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Categoria (opcional):</label>
                <input type="text" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Ex: Moradia, Lazer..."
                  style={{ width: '100%', padding: 10, fontSize: 15, borderRadius: 8, border: '1px solid #ddd' }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Forma de pagamento:</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {([['pix', '⚡ PIX'], ['boleto', '📄 Boleto'], ['credit_card', '💳 Cartão']] as const).map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => setFormData({ ...formData, payment_method: val })}
                      style={{ padding: 10, border: formData.payment_method === val ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 8, backgroundColor: formData.payment_method === val ? '#e8f4ff' : 'white', cursor: 'pointer', fontWeight: formData.payment_method === val ? 'bold' : 'normal', fontSize: 13 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {formData.payment_method === 'credit_card' && (
                  <p style={{ fontSize: 12, color: '#3498db', marginTop: 6 }}>
                    💡 Será pré-lançado automaticamente nas próximas faturas.
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>
                  {editingId ? '💾 Salvar' : '➕ Criar'}
                </button>
                <button type="button" onClick={resetForm} style={{ padding: '10px 20px', backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #ddd', borderRadius: 8, marginBottom: 20, overflow: 'hidden' }}>
          {(['fixed', 'variable'] as RecurrenceType[]).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ padding: '12px', border: 'none', cursor: 'pointer', fontWeight: activeTab === t ? 'bold' : 'normal', backgroundColor: activeTab === t ? '#3498db' : 'white', color: activeTab === t ? 'white' : '#333' }}
            >
              {t === 'fixed' ? `📋 Assinaturas (${fixed.length})` : `📊 Variáveis (${variable.length})`}
            </button>
          ))}
        </div>

        {/* Lista fixas */}
        {activeTab === 'fixed' && (
          <>
            {fixed.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <p>Nenhuma assinatura cadastrada ainda.</p>
                <p style={{ fontSize: 13 }}>Adicione Netflix, Spotify, academia...</p>
              </div>
            ) : fixed.map(r => {
              const urgency = getDaysUntil(r.due_day);
              const isUrgent = urgency.startsWith('⚠️');
              return (
                <div key={r.id} style={{ border: isUrgent ? '2px solid #f39c12' : '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 10, backgroundColor: isUrgent ? '#fffdf0' : 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 4 }}>{r.name}</div>
                    <div style={{ fontSize: 13, color: '#666' }}>
                      {r.category && <span>{r.category} · </span>}
                      Todo dia {r.due_day} · {urgency}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', fontSize: 18, color: '#e74c3c', marginBottom: 6 }}>
                      R$ {Number(r.amount).toFixed(2)}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(r.payment_method === 'pix' || r.payment_method === 'boleto') && isUrgent && (
                        <button onClick={() => payNow(r)} style={{ padding: '5px 10px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                          {r.payment_method === 'boleto' ? '📄 Pagar' : '⚡ Pagar'}
                        </button>
                      )}
                      <button onClick={() => startEdit(r)} style={{ padding: '5px 10px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>✏️</button>
                      <button onClick={() => deleteRecurrence(r.id, r.name)} style={{ padding: '5px 10px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Lista variáveis */}
        {activeTab === 'variable' && (
          <>
            {variable.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <p>Nenhuma conta variável cadastrada ainda.</p>
                <p style={{ fontSize: 13 }}>Adicione água, luz, energia...</p>
              </div>
            ) : variable.map(r => {
              const urgency = getDaysUntil(r.due_day);
              const isUrgent = urgency.startsWith('⚠️');
              return (
                <div key={r.id} style={{ border: isUrgent ? '2px solid #f39c12' : '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 10, backgroundColor: isUrgent ? '#fffdf0' : 'white' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 4 }}>{r.name}</div>
                      <div style={{ fontSize: 13, color: '#666' }}>
                        {r.category && <span>{r.category} · </span>}
                        Todo dia {r.due_day} · {urgency}
                      </div>
                      {r.last_variable_amount && (
                        <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                          Último lançamento: R$ {Number(r.last_variable_amount).toFixed(2)}
                          {r.last_updated ? ` em ${new Date(r.last_updated + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(r.payment_method === 'pix' || r.payment_method === 'boleto') && isUrgent && (
                        <button onClick={() => payNow(r)} style={{ padding: '5px 10px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                          {r.payment_method === 'boleto' ? '📄 Pagar' : '⚡ Pagar'}
                        </button>
                      )}
                      <button onClick={() => startEdit(r)} style={{ padding: '5px 10px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>✏️</button>
                      <button onClick={() => deleteRecurrence(r.id, r.name)} style={{ padding: '5px 10px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                    </div>
                  </div>

                  {/* Campo para lançar valor do mês */}
                  <div style={{ backgroundColor: '#f8f9fa', borderRadius: 8, padding: 12, border: '1px solid #eee' }}>
                    <label style={{ fontSize: 13, fontWeight: 'bold', display: 'block', marginBottom: 8 }}>💸 Lançar valor deste mês:</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="number" placeholder={r.last_variable_amount ? `Último: R$ ${Number(r.last_variable_amount).toFixed(2)}` : 'R$ 0.00'}
                        value={variableAmounts[r.id] || ''}
                        onChange={e => setVariableAmounts(prev => ({ ...prev, [r.id]: e.target.value }))}
                        step="0.01" min="0"
                        style={{ flex: 1, padding: 10, fontSize: 15, borderRadius: 8, border: '1px solid #ddd' }}
                      />
                      <button
                        onClick={() => saveVariableAmount(r.id)}
                        style={{ padding: '10px 16px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                      >
                        ✅ Lançar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </main>
    </>
  );
}