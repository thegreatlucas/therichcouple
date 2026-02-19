'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEncryptedInsert } from '@/lib/useEncryptedInsert';
import { applyBalanceDelta } from '@/lib/balance';

export default function NewTransaction() {
  const [user, setUser] = useState<any>(null);
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
  const [creditPaymentType, setCreditPaymentType] = useState<'avista' | 'parcelado'>('avista');
  const [installments, setInstallments] = useState('2');
  const [hasInterest, setHasInterest] = useState(false);
  const [installmentValue, setInstallmentValue] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { encryptRecord } = useEncryptedInsert();

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUser(user);

      const { data: memberData } = await supabase
        .from('household_members')
        .select('households(id, name)')
        .eq('user_id', user.id);

      const householdId = (memberData?.[0]?.households as any)?.id;
      if (householdId) {
        setSelectedHousehold(householdId);
        await loadHouseholdData(householdId);
      }
    }
    loadData();
  }, [router]);

  useEffect(() => {
    if (paymentMethod !== 'credit' || !creditCardId || !date) return;
    const card = creditCards.find(c => c.id === creditCardId);
    if (!card) return;
    setInvoiceMonth(calculateInvoiceMonth(date, card.closing_day));
  }, [date, creditCardId, creditCards, paymentMethod]);

  async function loadHouseholdData(householdId: string) {
    const [catRes, accRes, cardRes] = await Promise.all([
      supabase.from('categories').select('*').eq('household_id', householdId).order('name').order('parent_id', { nullsFirst: true }),
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

  function formatCurrency(value: number) {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  }

  function getInvoiceMonthLabel(isoMonth: string) {
    if (!isoMonth) return '';
    return new Date(isoMonth + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  const originalAmount = parseFloat(amount || '0');
  const numInstallments = parseInt(installments || '1');
  const instValue = parseFloat(installmentValue || '0');
  const isParcelado = paymentMethod === 'credit' && creditPaymentType === 'parcelado';
  const totalWithInterest = hasInterest && instValue > 0 ? instValue * numInstallments : 0;
  const interestAmount = totalWithInterest > 0 ? totalWithInterest - originalAmount : 0;
  const interestPercent = originalAmount > 0 && interestAmount > 0
    ? ((interestAmount / originalAmount) * 100).toFixed(1) : '0';
  const finalAmount = isParcelado && hasInterest && totalWithInterest > 0
    ? totalWithInterest : originalAmount;

  function clearForm() {
    setAmount(''); setDescription(''); setCategoryId('');
    setDate(new Date().toISOString().split('T')[0]);
    setSplitType('individual'); setPaymentMethod('cash');
    setIsRecurring(false); setIsSubscription(false);
    setRecurringFrequency('monthly'); setRecurringDayOfMonth('');
    setCreditCardId(creditCards[0]?.id || ''); setInvoiceMonth('');
    setCreditPaymentType('avista'); setInstallments('2');
    setHasInterest(false); setInstallmentValue('');
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
      .from('household_members').select('user_id')
      .eq('household_id', selectedHousehold);
    const otherUserId = members?.find((m: any) => m.user_id !== user.id)?.user_id;

    const txBase: any = {
      household_id: selectedHousehold,
      account_id: paymentMethod !== 'credit' ? accountId : null,
      user_id: user.id,
      payer_id: user.id,
      category_id: categoryId || null,
      amount: finalAmount,
      original_amount: originalAmount,
      description: description.trim(),
      date,
      payment_method: paymentMethod,
      split: splitType,
      is_recurring: isRecurring || isSubscription,
      is_subscription: isSubscription,
      // Salva referência ao cartão e mês da fatura para permitir decrementar ao deletar
      credit_card_id: paymentMethod === 'credit' ? creditCardId : null,
      invoice_month: paymentMethod === 'credit' ? invoiceMonth : null,
    };

    if (isParcelado) {
      txBase.installments_count = numInstallments;
      txBase.installment_value = hasInterest && instValue > 0
        ? instValue
        : originalAmount / numInstallments;
      if (hasInterest && totalWithInterest > 0) {
        txBase.total_with_interest = totalWithInterest;
      }
    }

    const txPayload = await encryptRecord(txBase);

    const { data: newTx, error: transError } = await supabase
      .from('transactions').insert(txPayload).select().single();

    if (transError) {
      alert('❌ Erro ao salvar: ' + transError.message);
      setLoading(false);
      return;
    }

    // Fatura de cartão
    if (paymentMethod === 'credit' && creditCardId && invoiceMonth) {
      const { data: existingInvoice } = await supabase
        .from('invoices').select('*')
        .eq('credit_card_id', creditCardId)
        .eq('month', invoiceMonth)
        .maybeSingle();

      if (existingInvoice) {
        await supabase.from('invoices')
          .update({ total: Number(existingInvoice.total) + finalAmount })
          .eq('id', existingInvoice.id);
      } else {
        await supabase.from('invoices').insert({
          credit_card_id: creditCardId,
          month: invoiceMonth,
          total: finalAmount,
          status: 'open',
        });
      }
    }

    // CORRIGIDO: balance usando applyBalanceDelta centralizado
    // currentUser pagou → otherUser deve metade para currentUser (delta positivo)
    if (splitType === 'shared' && otherUserId) {
      await applyBalanceDelta(selectedHousehold, user.id, otherUserId, finalAmount / 2);
    }

    // Recorrência
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
        split: splitType,
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
        {/* Valor original */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>💰 Valor original da compra:</label>
          <input
            type="number" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00" step="0.01" min="0.01"
            style={{ width: '100%', padding: 12, fontSize: 20, borderRadius: 8, border: '2px solid #3498db', fontWeight: 'bold', color: '#e74c3c' }}
            required
          />
          {amount && (
            <div style={{ marginTop: 8, fontSize: 18, color: '#e74c3c', fontWeight: 'bold' }}>
              {formatCurrency(originalAmount)}
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
          {(() => {
            const roots = categories.filter((c: any) => !c.parent_id);
            const subs = categories.filter((c: any) => c.parent_id);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {roots.map((cat: any) => {
                  const children = subs.filter((s: any) => s.parent_id === cat.id);
                  const isSelected = categoryId === cat.id;
                  return (
                    <div key={cat.id}>
                      {/* Categoria principal */}
                      <button type="button" onClick={() => setCategoryId(isSelected ? '' : cat.id)}
                        style={{ width: '100%', padding: '10px 14px', border: isSelected ? `3px solid ${cat.color || '#3498db'}` : '1px solid #ddd', borderRadius: 10, backgroundColor: isSelected ? (cat.color || '#3498db') : 'white', color: isSelected ? 'white' : '#333', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontWeight: isSelected ? 700 : 400, fontSize: 14, textAlign: 'left' }}>
                        <span style={{ fontSize: 22 }}>{cat.icon || '📁'}</span>
                        <span style={{ flex: 1 }}>{cat.name}</span>
                        {children.length > 0 && <span style={{ fontSize: 11, opacity: 0.7 }}>{children.length} sub</span>}
                      </button>
                      {/* Subcategorias */}
                      {children.length > 0 && (
                        <div style={{ marginLeft: 20, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {children.map((sub: any) => {
                            const isSubSel = categoryId === sub.id;
                            return (
                              <button key={sub.id} type="button" onClick={() => setCategoryId(isSubSel ? '' : sub.id)}
                                style={{ padding: '7px 12px', border: isSubSel ? `2px solid ${sub.color || cat.color || '#3498db'}` : '1px solid #eee', borderRadius: 8, borderLeft: `3px solid ${cat.color || '#3498db'}`, backgroundColor: isSubSel ? (sub.color || cat.color || '#3498db') : '#fafafa', color: isSubSel ? 'white' : '#444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, textAlign: 'left', fontWeight: isSubSel ? 600 : 400 }}>
                                <span style={{ fontSize: 11, color: isSubSel ? 'rgba(255,255,255,0.7)' : '#aaa' }}>↳</span>
                                <span style={{ fontSize: 18 }}>{sub.icon || cat.icon || '📁'}</span>
                                <span>{sub.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {categories.length === 0 && (
            <p style={{ color: '#666', fontSize: 14, marginTop: 8 }}>
              Nenhuma categoria. <Link href="/categories" style={{ color: '#3498db' }}>Criar</Link>
            </p>
          )}
        </div>

        {/* Data */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>📅 Data:</label>
          <input type="date" value={date}
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
              { value: 'meal_voucher', label: '🍽️ Vale Ref.' },
            ].map((method) => (
              <button key={method.value} type="button"
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

        {/* Cartão */}
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
                    <button key={card.id} type="button"
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
                  <div style={{ backgroundColor: '#fff3cd', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
                    📄 Esta compra cairá na fatura de <strong>{getInvoiceMonthLabel(invoiceMonth)}</strong>
                  </div>
                )}

                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 8, fontSize: 14 }}>Forma de compra:</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {([['avista', '💳 À vista'], ['parcelado', '📊 Parcelado']] as const).map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => { setCreditPaymentType(val); setHasInterest(false); setInstallmentValue(''); }}
                      style={{ padding: 10, border: creditPaymentType === val ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 8, backgroundColor: creditPaymentType === val ? '#e8f4ff' : 'white', cursor: 'pointer', fontWeight: creditPaymentType === val ? 'bold' : 'normal', fontSize: 13 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {creditPaymentType === 'parcelado' && (
                  <div style={{ backgroundColor: '#f8f9ff', borderRadius: 8, padding: 12, border: '1px solid #dde' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 'bold', display: 'block', marginBottom: 4 }}>Parcelas:</label>
                        <select value={installments}
                          onChange={e => { setInstallments(e.target.value); setInstallmentValue(''); }}
                          style={{ width: '100%', padding: 8, fontSize: 14, borderRadius: 6, border: '1px solid #ccc' }}
                        >
                          {[2,3,4,5,6,7,8,9,10,11,12,18,24].map(n => (
                            <option key={n} value={n}>{n}x</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 'bold', display: 'block', marginBottom: 4 }}>Juros:</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {([false, true] as const).map(v => (
                            <button key={String(v)} type="button"
                              onClick={() => { setHasInterest(v); if (!v) setInstallmentValue(''); }}
                              style={{ flex: 1, padding: 8, border: hasInterest === v ? '2px solid #e74c3c' : '1px solid #ddd', borderRadius: 6, backgroundColor: hasInterest === v ? (v ? '#fde8e8' : '#e8f8f0') : 'white', cursor: 'pointer', fontSize: 12, fontWeight: hasInterest === v ? 'bold' : 'normal' }}
                            >
                              {v ? '📈 Com juros' : '✅ Sem juros'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {!hasInterest && amount && (
                      <div style={{ backgroundColor: '#e8f8f0', padding: 10, borderRadius: 6, fontSize: 13, textAlign: 'center' }}>
                        ✅ {installments}x de <strong>{formatCurrency(originalAmount / numInstallments)}</strong> sem juros
                      </div>
                    )}

                    {hasInterest && (
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 'bold', display: 'block', marginBottom: 4 }}>
                          💰 Valor de cada parcela com juros (R$):
                        </label>
                        <input
                          type="number" value={installmentValue}
                          onChange={e => setInstallmentValue(e.target.value)}
                          placeholder="Ex: 85.90" step="0.01" min="0"
                          style={{ width: '100%', padding: 8, fontSize: 15, borderRadius: 6, border: '2px solid #e74c3c', marginBottom: 8 }}
                        />
                        {installmentValue && amount && (
                          <div style={{ backgroundColor: '#fde8e8', padding: 12, borderRadius: 8, border: '1px solid #e74c3c' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center', marginBottom: 10 }}>
                              <div>
                                <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Valor original</div>
                                <div style={{ fontWeight: 'bold', fontSize: 15 }}>{formatCurrency(originalAmount)}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Total com juros</div>
                                <div style={{ fontWeight: 'bold', fontSize: 15, color: '#e74c3c' }}>{formatCurrency(totalWithInterest)}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Juros pagos</div>
                                <div style={{ fontWeight: 'bold', fontSize: 15, color: '#c0392b' }}>
                                  {formatCurrency(interestAmount)}
                                  <span style={{ fontSize: 11, display: 'block', fontWeight: 'normal' }}>+{interestPercent}%</span>
                                </div>
                              </div>
                            </div>
                            <div style={{ textAlign: 'center', fontSize: 12, color: '#888' }}>
                              {numInstallments}x de {formatCurrency(instValue)} · será salvo como {formatCurrency(totalWithInterest)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Conta */}
        {paymentMethod !== 'credit' && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>🏦 Conta:</label>
            {accounts.length === 0 ? (
              <p style={{ color: '#e74c3c', fontSize: 14 }}>
                Nenhuma conta. <Link href="/accounts" style={{ color: '#3498db' }}>Criar conta</Link>
              </p>
            ) : (
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
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
              💡 Cada um paga: <strong>{formatCurrency(finalAmount / 2)}</strong>
            </div>
          )}
        </div>

        {/* Recorrência */}
        {!isParcelado && (
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
                  <select value={recurringFrequency} onChange={(e) => setRecurringFrequency(e.target.value)}
                    style={{ width: '100%', padding: 8, fontSize: 14, borderRadius: 4, border: '1px solid #ccc' }}>
                    <option value="monthly">Mensal</option>
                    <option value="weekly">Semanal</option>
                  </select>
                </div>
                {recurringFrequency === 'monthly' && (
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 'bold' }}>Todo dia:</label>
                    <input type="number" value={recurringDayOfMonth}
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
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" disabled={loading}
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