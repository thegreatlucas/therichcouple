'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewTransaction() {
  const [user, setUser] = useState<any>(null);
  const [households, setHouseholds] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [creditCards, setCreditCards] = useState<any[]>([]);
  const [selectedHousehold, setSelectedHousehold] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [creditCardId, setCreditCardId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [splitType, setSplitType] = useState('individual');
  const [isRecurring, setIsRecurring] = useState(false);
  const [isSubscription, setIsSubscription] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState('monthly');
  const [recurringDayOfMonth, setRecurringDayOfMonth] = useState('');
  const [invoiceMonth, setInvoiceMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUser(user);

      const { data: memberData } = await supabase
        .from('household_members')
        .select('households(id, name)')
        .eq('user_id', user.id);

      setHouseholds(memberData || []);
      const householdId = (memberData?.[0]?.households as any)?.id;

      if (householdId) {
        setSelectedHousehold(householdId);
        await loadHouseholdData(householdId);
      }
    }
    loadData();
  }, [router]);

  useEffect(() => {
    if (!selectedHousehold) return;
    loadHouseholdData(selectedHousehold);
  }, [selectedHousehold]);

  useEffect(() => {
    if (paymentMethod !== 'credit' || !creditCardId || !date) return;
    const card = creditCards.find(c => c.id === creditCardId);
    if (!card) return;
    setInvoiceMonth(calculateInvoiceMonth(date, card.closing_day));
  }, [date, creditCardId, creditCards, paymentMethod]);

  async function loadHouseholdData(householdId: string) {
    const [catRes, accRes, cardRes] = await Promise.all([
      supabase.from('categories').select('*').eq('household_id', householdId).order('name'),
      supabase.from('accounts').select('*').eq('household_id', householdId).order('name'),
      supabase.from('credit_cards').select('*').eq('household_id', householdId).order('name'),
    ]);

    setCategories(catRes.data || []);
    setAccounts(accRes.data || []);
    setCreditCards(cardRes.data || []);
    setAccountId(accRes.data?.[0]?.id || '');
    setCreditCardId(cardRes.data?.[0]?.id || '');
    setCategoryId('');
  }

  function calculateInvoiceMonth(purchaseDate: string, closingDay: number): string {
    const d = new Date(purchaseDate + 'T12:00:00');
    const day = d.getDate();
    if (day < closingDay) {
      return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    } else {
      return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().split('T')[0];
    }
  }

  function formatCurrency(value: string) {
    const num = parseFloat(value);
    if (isNaN(num)) return 'R$ 0,00';
    return `R$ ${num.toFixed(2).replace('.', ',')}`;
  }

  function getInvoiceMonthLabel(isoMonth: string) {
    if (!isoMonth) return '';
    return new Date(isoMonth + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  function clearForm() {
    setAmount('');
    setDescription('');
    setCategoryId('');
    setDate(new Date().toISOString().split('T')[0]);
    setSplitType('individual');
    setPaymentMethod('cash');
    setIsRecurring(false);
    setIsSubscription(false);
    setRecurringFrequency('monthly');
    setRecurringDayOfMonth('');
    setCreditCardId(creditCards[0]?.id || '');
    setInvoiceMonth('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedHousehold) { alert('⚠️ Selecione um casal'); return; }
    if (!amount || parseFloat(amount) <= 0) { alert('⚠️ Digite um valor válido'); return; }
    if (!description.trim()) { alert('⚠️ Digite uma descrição'); return; }
    if (paymentMethod !== 'credit' && !accountId) { alert('⚠️ Selecione uma conta'); return; }
    if (paymentMethod === 'credit' && !creditCardId) { alert('⚠️ Selecione um cartão'); return; }

    setLoading(true);

    const { data: members } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', selectedHousehold);

    const otherUserId = members?.find((m: any) => m.user_id !== user.id)?.user_id;

    // Insere a transação
    const { data: newTx, error: transError } = await supabase
      .from('transactions')
      .insert({
        household_id: selectedHousehold,
        account_id: paymentMethod !== 'credit' ? accountId : null,
        user_id: user.id,
        payer_id: user.id,
        category_id: categoryId || null,
        amount: parseFloat(amount),
        description: description.trim(),
        date: date,
        payment_method: paymentMethod,
        split: splitType,
        is_recurring: isRecurring || isSubscription,
        is_subscription: isSubscription,
      })
      .select()
      .single();

    if (transError) {
      alert('❌ Erro ao salvar: ' + transError.message);
      setLoading(false);
      return;
    }

    // Se crédito → cria/atualiza fatura
    if (paymentMethod === 'credit' && creditCardId && invoiceMonth) {
      const { data: existingInvoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('credit_card_id', creditCardId)
        .eq('month', invoiceMonth)
        .maybeSingle();

      if (existingInvoice) {
        await supabase
          .from('invoices')
          .update({ total: Number(existingInvoice.total) + parseFloat(amount) })
          .eq('id', existingInvoice.id);
      } else {
        await supabase.from('invoices').insert({
          credit_card_id: creditCardId,
          month: invoiceMonth,
          total: parseFloat(amount),
          status: 'open',
        });
      }
    }

    // Se compartilhado → atualiza balance acumulando (não sobrescrevendo)
    // Lógica: quem pagou tem crédito de metade do valor sobre o outro
    // O saldo é sempre guardado na direção: from_user deve para to_user
    if (splitType === 'shared' && otherUserId) {
      const splitAmount = parseFloat(amount) / 2;
      // user.id pagou → otherUserId deve splitAmount para user.id

      // Busca saldo existente nas duas direções
      const { data: balA } = await supabase
        .from('balances')
        .select('*')
        .eq('household_id', selectedHousehold)
        .eq('from_user_id', otherUserId)
        .eq('to_user_id', user.id)
        .maybeSingle();

      const { data: balB } = await supabase
        .from('balances')
        .select('*')
        .eq('household_id', selectedHousehold)
        .eq('from_user_id', user.id)
        .eq('to_user_id', otherUserId)
        .maybeSingle();

      if (balA) {
        // Já existe saldo no sentido correto (outro deve para mim) → soma
        await supabase
          .from('balances')
          .update({ amount: Number(balA.amount) + splitAmount })
          .eq('id', balA.id);
      } else if (balB) {
        // Existe saldo no sentido inverso (eu devia para o outro) → abate
        const newAmount = Number(balB.amount) - splitAmount;
        if (newAmount > 0.001) {
          // Ainda sobra dívida na mesma direção
          await supabase.from('balances').update({ amount: newAmount }).eq('id', balB.id);
        } else if (newAmount < -0.001) {
          // A dívida inverteu de direção
          await supabase.from('balances').delete().eq('id', balB.id);
          await supabase.from('balances').insert({
            household_id: selectedHousehold,
            from_user_id: otherUserId,
            to_user_id: user.id,
            amount: Math.abs(newAmount),
          });
        } else {
          // Zerou exatamente
          await supabase.from('balances').delete().eq('id', balB.id);
        }
      } else {
        // Nenhum saldo ainda → cria
        await supabase.from('balances').insert({
          household_id: selectedHousehold,
          from_user_id: otherUserId,
          to_user_id: user.id,
          amount: splitAmount,
        });
      }
    }

    // Se recorrente → cria regra
    if ((isRecurring || isSubscription) && newTx) {
      const selectedDate = new Date(date + 'T12:00:00');
      const dayOfMonth = recurringDayOfMonth ? parseInt(recurringDayOfMonth) : selectedDate.getDate();
      const nextDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, dayOfMonth);

      await supabase.from('recurrence_rules').insert({
        household_id: selectedHousehold,
        base_transaction_id: newTx.id,
        frequency: recurringFrequency,
        day_of_month: dayOfMonth,
        next_date: nextDate.toISOString().split('T')[0],
        active: true,
      });
    }

    alert('✅ Gasto salvo com sucesso!');
    router.push('/transactions');
  }

  const selectedCard = creditCards.find(c => c.id === creditCardId);

  return (
    <main style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 8 }}>💸 Novo Gasto</h1>
        <p style={{ color: '#666', fontSize: 14 }}>Preencha os dados do gasto abaixo</p>
      </div>

      <form onSubmit={handleSubmit}>

        {/* Valor */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>💰 Valor:</label>
          <input
            type="number" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00" step="0.01" min="0.01"
            style={{ width: '100%', padding: 12, fontSize: 20, borderRadius: 8, border: '2px solid #3498db', fontWeight: 'bold', color: '#e74c3c' }}
            required
          />
          {amount && (
            <div style={{ marginTop: 8, fontSize: 18, color: '#e74c3c', fontWeight: 'bold' }}>
              {formatCurrency(amount)}
            </div>
          )}
        </div>

        {/* Descrição */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>📝 Descrição:</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Compras no mercado"
            rows={2}
            style={{ width: '100%', padding: 12, fontSize: 16, borderRadius: 8, border: '1px solid #ddd', fontFamily: 'inherit', resize: 'vertical' }}
            required
          />
        </div>

        {/* Categoria */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>🏷️ Categoria:</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
            {categories.map((cat) => (
              <button
                key={cat.id} type="button"
                onClick={() => setCategoryId(categoryId === cat.id ? '' : cat.id)}
                style={{
                  padding: 10,
                  border: categoryId === cat.id ? '3px solid #3498db' : '1px solid #ddd',
                  borderRadius: 8,
                  backgroundColor: categoryId === cat.id ? cat.color || '#3498db' : 'white',
                  color: categoryId === cat.id ? 'white' : '#333',
                  cursor: 'pointer', fontSize: 13,
                  fontWeight: categoryId === cat.id ? 'bold' : 'normal',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}
              >
                <span style={{ fontSize: 22 }}>{cat.icon || '📁'}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
          {categories.length === 0 && (
            <p style={{ color: '#666', fontSize: 14, marginTop: 8 }}>
              Nenhuma categoria. <Link href="/categories" style={{ color: '#3498db' }}>Criar</Link>
            </p>
          )}
        </div>

        {/* Data */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>📅 Data:</label>
          <input
            type="date" value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: '100%', padding: 12, fontSize: 16, borderRadius: 8, border: '1px solid #ddd' }}
            required
          />
        </div>

        {/* Método de pagamento */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>💳 Método de pagamento:</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { value: 'cash', label: '💵 Dinheiro' },
              { value: 'debit', label: '💳 Débito' },
              { value: 'credit', label: '💳 Crédito' },
              { value: 'pix', label: '🔷 PIX' },
              { value: 'transfer', label: '🏦 Transferência' },
              { value: 'other', label: '❓ Outro' },
            ].map((method) => (
              <button
                key={method.value} type="button"
                onClick={() => setPaymentMethod(method.value)}
                style={{
                  padding: 10,
                  border: paymentMethod === method.value ? '2px solid #3498db' : '1px solid #ddd',
                  borderRadius: 8,
                  backgroundColor: paymentMethod === method.value ? '#e3f2fd' : 'white',
                  cursor: 'pointer', fontSize: 12,
                  fontWeight: paymentMethod === method.value ? 'bold' : 'normal',
                }}
              >
                {method.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cartão — só aparece se crédito */}
        {paymentMethod === 'credit' && (
          <div style={{ marginBottom: 20, backgroundColor: '#f0f4ff', padding: 16, borderRadius: 8, border: '1px solid #c5cae9' }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>💳 Cartão:</label>
            {creditCards.length === 0 ? (
              <p style={{ color: '#e74c3c', fontSize: 14 }}>
                Nenhum cartão cadastrado. <Link href="/credit-cards" style={{ color: '#3498db' }}>Cadastrar cartão</Link>
              </p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
                  {creditCards.map((card) => (
                    <button
                      key={card.id} type="button"
                      onClick={() => setCreditCardId(card.id)}
                      style={{
                        padding: 12,
                        border: creditCardId === card.id ? '2px solid #3498db' : '1px solid #ddd',
                        borderRadius: 8,
                        backgroundColor: creditCardId === card.id ? '#e3f2fd' : 'white',
                        cursor: 'pointer', textAlign: 'left',
                        fontWeight: creditCardId === card.id ? 'bold' : 'normal',
                      }}
                    >
                      <div style={{ fontSize: 13 }}>💳 {card.name}</div>
                      <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Fecha dia {card.closing_day}</div>
                    </button>
                  ))}
                </div>

                {selectedCard && invoiceMonth && (
                  <div style={{ backgroundColor: '#fff3cd', padding: 10, borderRadius: 8, fontSize: 13 }}>
                    📄 Esta compra cairá na fatura de <strong>{getInvoiceMonthLabel(invoiceMonth)}</strong>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Conta — só aparece se não for crédito */}
        {paymentMethod !== 'credit' && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>🏦 Conta:</label>
            {accounts.length === 0 ? (
              <p style={{ color: '#e74c3c', fontSize: 14 }}>
                Nenhuma conta. <Link href="/accounts" style={{ color: '#3498db' }}>Criar conta</Link>
              </p>
            ) : (
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                style={{ width: '100%', padding: 12, fontSize: 16, borderRadius: 8, border: '1px solid #ddd', backgroundColor: 'white' }}
                required
              >
                <option value="">Selecione uma conta...</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Divisão */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>✂️ Divisão:</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" onClick={() => setSplitType('individual')}
              style={{ padding: 16, border: splitType === 'individual' ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 8, backgroundColor: splitType === 'individual' ? '#e3f2fd' : 'white', cursor: 'pointer', fontWeight: splitType === 'individual' ? 'bold' : 'normal' }}
            >
              👤 Individual<br /><span style={{ fontSize: 12, color: '#666' }}>Só pra mim</span>
            </button>
            <button type="button" onClick={() => setSplitType('shared')}
              style={{ padding: 16, border: splitType === 'shared' ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 8, backgroundColor: splitType === 'shared' ? '#e3f2fd' : 'white', cursor: 'pointer', fontWeight: splitType === 'shared' ? 'bold' : 'normal' }}
            >
              👥 Compartilhado<br /><span style={{ fontSize: 12, color: '#666' }}>50/50 no casal</span>
            </button>
          </div>
          {splitType === 'shared' && amount && (
            <div style={{ marginTop: 12, padding: 12, backgroundColor: '#fff3cd', borderRadius: 8, fontSize: 14, textAlign: 'center' }}>
              💡 Cada um paga: <strong>{formatCurrency((parseFloat(amount) / 2).toString())}</strong>
            </div>
          )}
        </div>

        {/* Recorrência */}
        <div style={{ marginBottom: 24, backgroundColor: '#f8f9fa', padding: 16, borderRadius: 8, border: '1px solid #ddd' }}>
          <label style={{ display: 'block', marginBottom: 12, fontWeight: 'bold' }}>🔁 Recorrência:</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <button type="button"
              onClick={() => { setIsRecurring(!isRecurring); if (isSubscription) setIsSubscription(false); }}
              style={{ padding: 12, border: isRecurring ? '2px solid #9b59b6' : '1px solid #ddd', borderRadius: 8, backgroundColor: isRecurring ? '#f3e5f5' : 'white', cursor: 'pointer', fontWeight: isRecurring ? 'bold' : 'normal', fontSize: 13 }}
            >
              🔁 Recorrente<br /><span style={{ fontSize: 11, color: '#666' }}>Aluguel, conta fixa...</span>
            </button>
            <button type="button"
              onClick={() => { setIsSubscription(!isSubscription); if (isRecurring) setIsRecurring(false); }}
              style={{ padding: 12, border: isSubscription ? '2px solid #9b59b6' : '1px solid #ddd', borderRadius: 8, backgroundColor: isSubscription ? '#f3e5f5' : 'white', cursor: 'pointer', fontWeight: isSubscription ? 'bold' : 'normal', fontSize: 13 }}
            >
              📺 Assinatura<br /><span style={{ fontSize: 11, color: '#666' }}>Netflix, Spotify...</span>
            </button>
          </div>

          {(isRecurring || isSubscription) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 'bold' }}>Frequência:</label>
                <select
                  value={recurringFrequency}
                  onChange={(e) => setRecurringFrequency(e.target.value)}
                  style={{ width: '100%', padding: 8, fontSize: 14, borderRadius: 4, border: '1px solid #ccc' }}
                >
                  <option value="monthly">Mensal</option>
                  <option value="weekly">Semanal</option>
                </select>
              </div>
              {recurringFrequency === 'monthly' && (
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 'bold' }}>Todo dia:</label>
                  <input
                    type="number"
                    value={recurringDayOfMonth}
                    onChange={(e) => setRecurringDayOfMonth(e.target.value)}
                    placeholder={`${new Date(date + 'T12:00:00').getDate()} (da data)`}
                    min="1" max="31"
                    style={{ width: '100%', padding: 8, fontSize: 14, borderRadius: 4, border: '1px solid #ccc' }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="submit" disabled={loading}
            style={{ flex: 1, padding: '16px 24px', fontSize: 18, fontWeight: 'bold', backgroundColor: loading ? '#95a5a6' : '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? '⏳ Salvando...' : '✅ Salvar Gasto'}
          </button>
          <button type="button" onClick={clearForm}
            style={{ padding: '16px 24px', fontSize: 16, backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            🗑️
          </button>
        </div>
      </form>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <Link href="/transactions">
          <button style={{ padding: '12px 24px', fontSize: 16 }}>⬅️ Voltar</button>
        </Link>
      </div>
    </main>
  );
}