'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';

export default function CreditCardsPage() {
  const [cards, setCards] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    closing_day: '',
    due_day: '',
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
      await loadCards(member.household_id);
      setLoading(false);
    }
    init();
  }, []);

  async function loadCards(hid: string) {
    const { data } = await supabase
      .from('credit_cards')
      .select('*')
      .eq('household_id', hid)
      .order('name');
    setCards(data || []);
  }

  async function loadInvoices(cardId: string) {
    setSelectedCard(cardId);
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('credit_card_id', cardId)
      .order('month', { ascending: false });
    setInvoices(data || []);
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
      closing_day: parseInt(formData.closing_day),
      due_day: parseInt(formData.due_day),
      household_id: member.household_id,
      owner_id: user.id,
    };

    if (editingId) {
      const { error } = await supabase.from('credit_cards').update(payload).eq('id', editingId);
      if (error) { alert('Erro ao atualizar: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('credit_cards').insert(payload);
      if (error) { alert('Erro ao criar: ' + error.message); return; }
    }

    setFormData({ name: '', closing_day: '', due_day: '' });
    setEditingId(null);
    setShowForm(false);
    await loadCards(member.household_id);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Deletar o cartão "${name}"?`)) return;
    const { error } = await supabase.from('credit_cards').delete().eq('id', id);
    if (error) { alert('Erro: ' + error.message); return; }
    if (selectedCard === id) { setSelectedCard(null); setInvoices([]); }
    if (householdId) loadCards(householdId);
  }

  async function markInvoicePaid(invoiceId: string) {
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'paid' })
      .eq('id', invoiceId);
    if (error) { alert('Erro: ' + error.message); return; }
    if (selectedCard) loadInvoices(selectedCard);
  }

  // Calcula qual mês/ano uma compra pertence dado o dia de fechamento
  function getInvoiceMonth(purchaseDate: Date, closingDay: number): string {
    const day = purchaseDate.getDate();
    const month = purchaseDate.getMonth();
    const year = purchaseDate.getFullYear();

    // Se a compra for feita ANTES do fechamento, cai no mês atual
    // Se for no dia do fechamento ou depois, cai no mês seguinte
    if (day < closingDay) {
      return new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    } else {
      return new Date(year, month + 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    }
  }

  function startEdit(card: any) {
    setEditingId(card.id);
    setFormData({
      name: card.name,
      closing_day: card.closing_day.toString(),
      due_day: card.due_day.toString(),
    });
    setShowForm(true);
  }

  function cancelEdit() {
    setEditingId(null);
    setFormData({ name: '', closing_day: '', due_day: '' });
    setShowForm(false);
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case 'open': return { label: '🟡 Aberta', color: '#f39c12' };
      case 'closed': return { label: '🔴 Fechada', color: '#e74c3c' };
      case 'paid': return { label: '🟢 Paga', color: '#2ecc71' };
      default: return { label: status, color: '#95a5a6' };
    }
  }

  if (loading) return <main style={{ padding: 16 }}>Carregando...</main>;

  // Exemplo ao vivo de qual fatura cairia hoje
  const today = new Date();

  return (
    <>
      <Header title="Cartões de Crédito" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>💳 Cartões de Crédito</h1>
        <button
          onClick={() => { cancelEdit(); setShowForm(!showForm); }}
          style={{
            padding: '8px 16px', fontSize: 16,
            backgroundColor: showForm ? '#e74c3c' : '#2ecc71',
            color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer'
          }}
        >
          {showForm ? '✖️ Cancelar' : '➕ Novo cartão'}
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ backgroundColor: '#f5f5f5', padding: 20, borderRadius: 8, marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Editar Cartão' : 'Novo Cartão'}</h3>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Nome:</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Nubank, Bradesco..."
              style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Dia de fechamento:</label>
              <input
                type="number"
                value={formData.closing_day}
                onChange={(e) => setFormData({ ...formData, closing_day: e.target.value })}
                placeholder="Ex: 3"
                min={1} max={31}
                style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }}
                required
              />
              <small style={{ color: '#666' }}>Compras até o dia anterior caem no mês atual</small>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Dia de vencimento:</label>
              <input
                type="number"
                value={formData.due_day}
                onChange={(e) => setFormData({ ...formData, due_day: e.target.value })}
                placeholder="Ex: 10"
                min={1} max={31}
                style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }}
                required
              />
            </div>
          </div>

          {/* Preview da lógica de fatura */}
          {formData.closing_day && (
            <div style={{ backgroundColor: '#e3f2fd', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
              <strong>📅 Exemplo com hoje ({today.toLocaleDateString('pt-BR')}):</strong><br />
              Uma compra feita hoje cairia na fatura de{' '}
              <strong>{getInvoiceMonth(today, parseInt(formData.closing_day))}</strong>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={{ padding: '10px 20px', fontSize: 16, backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              {editingId ? '💾 Salvar' : '➕ Criar'}
            </button>
            <button type="button" onClick={cancelEdit} style={{ padding: '10px 20px', fontSize: 16, backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista de cartões */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 32 }}>
        {cards.length === 0 ? (
          <p style={{ color: '#666', gridColumn: '1/-1' }}>Nenhum cartão cadastrado ainda.</p>
        ) : (
          cards.map((card) => (
            <div
              key={card.id}
              onClick={() => loadInvoices(card.id)}
              style={{
                border: selectedCard === card.id ? '2px solid #3498db' : '1px solid #ddd',
                padding: 20,
                borderRadius: 12,
                backgroundColor: selectedCard === card.id ? '#e3f2fd' : 'white',
                cursor: 'pointer',
                position: 'relative'
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>💳</div>
              <div style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 4 }}>{card.name}</div>
              <div style={{ fontSize: 13, color: '#666' }}>Fecha dia <strong>{card.closing_day}</strong> · Vence dia <strong>{card.due_day}</strong></div>
              <div style={{ fontSize: 12, color: '#3498db', marginTop: 4 }}>
                Compra hoje → fatura de {getInvoiceMonth(today, card.closing_day)}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); startEdit(card); }}
                  style={{ padding: '6px 10px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(card.id, card.name); }}
                  style={{ padding: '6px 10px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Faturas do cartão selecionado */}
      {selectedCard && (
        <div>
          <h2>📄 Faturas — {cards.find(c => c.id === selectedCard)?.name}</h2>
          {invoices.length === 0 ? (
            <p style={{ color: '#666' }}>Nenhuma fatura gerada ainda. As faturas aparecem automaticamente conforme você lança gastos no cartão.</p>
          ) : (
            <div>
              {invoices.map((inv) => {
                const status = getStatusLabel(inv.status);
                return (
                  <div
                    key={inv.id}
                    style={{
                      border: '1px solid #ddd',
                      padding: 16,
                      marginBottom: 12,
                      borderRadius: 8,
                      backgroundColor: 'white',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: 16 }}>
                        {new Date(inv.month + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                        <span style={{ color: status.color, fontWeight: 'bold' }}>{status.label}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 'bold', color: '#e74c3c' }}>
                        R$ {Number(inv.total).toFixed(2)}
                      </div>
                      {inv.status !== 'paid' && (
                        <button
                          onClick={() => markInvoicePaid(inv.id)}
                          style={{ marginTop: 8, padding: '6px 12px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                        >
                          ✅ Marcar como paga
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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