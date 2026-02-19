'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hasPartner, setHasPartner] = useState(false);
  // CORRIGIDO: nome real do parceiro
  const [partnerName, setPartnerName] = useState('Parceiro(a)');

  const [totalIncome, setTotalIncome] = useState(0);
  // CORRIGIDO: gastos agora são só do uid, não de todo o household
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [sharedExpenses, setSharedExpenses] = useState(0);
  const [individualExpenses, setIndividualExpenses] = useState(0);

  const [topCategories, setTopCategories] = useState<{ name: string; icon: string; color: string; amount: number }[]>([]);
  const [upcomingRecurrences, setUpcomingRecurrences] = useState<any[]>([]);
  const [balance, setBalance] = useState<{ amount: number; iOwe: boolean } | null>(null);
  const [activeGoals, setActiveGoals] = useState<any[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<{ total: number; spent: number } | null>(null);

  const router = useRouter();

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const monthLabel = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const today = now.toISOString().split('T')[0];
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUserEmail(user.email || '');
    setUserName(user.user_metadata?.name || user.email?.split('@')[0] || '');
    setCurrentUserId(user.id);

    const { data: member } = await supabase
      .from('household_members')
      .select('household_id, households(name)')
      .eq('user_id', user.id)
      .single();

    if (!member) { router.push('/setup'); return; }

    const hid = member.household_id;
    setHouseholdId(hid);
    setHouseholdName((member.households as any)?.name || '');

    await Promise.all([
      loadFinancials(hid, user.id),
      loadUpcomingRecurrences(hid),
      loadBalance(hid, user.id),
      loadGoals(hid, user.id),
      loadBudgetSummary(hid),
      checkPartner(hid, user.id),
    ]);

    setLoading(false);
  }

  async function checkPartner(hid: string, uid: string) {
    const { data } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', hid);

    const members = data || [];
    setHasPartner(members.length >= 2);

    // CORRIGIDO: busca nome real do parceiro
    const partnerRow = members.find((m: any) => m.user_id !== uid);
    if (partnerRow) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', partnerRow.user_id)
        .single();
      if (profile?.name) setPartnerName(profile.name);
    }
  }

  async function loadFinancials(hid: string, uid: string) {
    // Renda do mês (do usuário logado)
    const { data: incomes } = await supabase
      .from('incomes')
      .select('amount')
      .eq('household_id', hid)
      .eq('user_id', uid)
      .gte('month', firstDay)
      .lte('month', lastDay);

    const income = (incomes || []).reduce((s, i) => s + Number(i.amount), 0);
    setTotalIncome(income);

    // CORRIGIDO: gastos filtrados por user_id para ser coerente com a renda
    const { data: txs } = await supabase
      .from('transactions')
      .select('amount, split, payer_id, categories(name, icon, color)')
      .eq('household_id', hid)
      .eq('user_id', uid)
      .gte('date', firstDay)
      .lte('date', lastDay);

    const all = txs || [];
    const total = all.reduce((s, t) => s + Number(t.amount), 0);
    const shared = all.filter(t => t.split === 'shared').reduce((s, t) => s + Number(t.amount), 0);
    const individual = all.filter(t => t.split === 'individual').reduce((s, t) => s + Number(t.amount), 0);

    setTotalExpenses(total);
    setSharedExpenses(shared);
    setIndividualExpenses(individual);

    // Top 3 categorias do mês
    const catMap = new Map<string, { name: string; icon: string; color: string; amount: number }>();
    all.forEach((t: any) => {
      const key = t.categories?.name || 'Sem categoria';
      const existing = catMap.get(key);
      catMap.set(key, {
        name: key,
        icon: t.categories?.icon || '📁',
        color: t.categories?.color || '#95a5a6',
        amount: (existing?.amount || 0) + Number(t.amount),
      });
    });

    const top3 = Array.from(catMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
    setTopCategories(top3);
  }

  async function loadUpcomingRecurrences(hid: string) {
    const { data } = await supabase
      .from('recurrence_rules')
      .select('*')
      .eq('household_id', hid)
      .eq('active', true)
      .lte('next_date', in7days)
      .order('next_date');

    setUpcomingRecurrences(data || []);
  }

  async function loadBalance(hid: string, uid: string) {
    const { data: balRows } = await supabase
      .from('balances')
      .select('*')
      .eq('household_id', hid);

    let net = 0;
    for (const row of balRows || []) {
      if (row.to_user_id === uid) net += Number(row.amount);
      else if (row.from_user_id === uid) net -= Number(row.amount);
    }

    if (Math.abs(net) > 0.001) {
      setBalance({ amount: Math.abs(net), iOwe: net < 0 });
    } else {
      setBalance(null);
    }
  }

  async function loadGoals(hid: string, uid: string) {
    const { data } = await supabase
      .from('goals')
      .select('*')
      .eq('household_id', hid)
      .or(`type.eq.shared,owner_id.eq.${uid}`)
      .order('created_at');

    const inProgress = (data || [])
      .filter(g => Number(g.current_amount) < Number(g.target_amount))
      .slice(0, 3);
    setActiveGoals(inProgress);
  }

  async function loadBudgetSummary(hid: string) {
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const { data: budgets } = await supabase
      .from('budgets')
      .select('amount')
      .eq('household_id', hid)
      .eq('month', monthStr);

    if (!budgets || budgets.length === 0) { setBudgetSummary(null); return; }

    const totalBudget = budgets.reduce((s, b) => s + Number(b.amount), 0);

    const { data: txs } = await supabase
      .from('transactions')
      .select('amount')
      .eq('household_id', hid)
      .gte('date', firstDay)
      .lte('date', lastDay);

    const spent = (txs || []).reduce((s, t) => s + Number(t.amount), 0);
    setBudgetSummary({ total: totalBudget, spent });
  }

  function daysUntil(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00');
    const diff = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'atrasado';
    if (diff === 0) return 'hoje';
    if (diff === 1) return 'amanhã';
    return `em ${diff} dias`;
  }

  const balance_display = totalIncome > 0 ? totalIncome - totalExpenses : null;

  if (loading) return (
    <main style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
      <p style={{ color: '#666' }}>⏳ Carregando seu dashboard...</p>
    </main>
  );

  return (
    <>
      <Header title="💑 Finanças do Casal" action={{ label: '⚙️', href: '/setup' }} />
      <main style={{ padding: 16, maxWidth: 700, margin: '0 auto', paddingBottom: 48 }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22 }}>
                Olá{userName ? `, ${userName}` : ''}! 👋
              </h1>
              <p style={{ margin: '4px 0 0', color: '#666', fontSize: 14 }}>
                {householdName && `🏠 ${householdName} · `}{monthLabel}
              </p>
            </div>
            <Link href="/transactions/new">
              <button style={{
                padding: '10px 18px', backgroundColor: '#2ecc71', color: 'white',
                border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 'bold', fontSize: 14
              }}>
                ➕ Lançar
              </button>
            </Link>
          </div>

          {!hasPartner && (
            <div style={{ marginTop: 14, padding: '10px 14px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, fontSize: 13 }}>
              👫 Seu parceiro(a) ainda não entrou.{' '}
              <Link href="/setup" style={{ color: '#856404', fontWeight: 'bold' }}>Compartilhar código de convite →</Link>
            </div>
          )}
        </div>

        {/* Cards financeiros principais */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={{ border: '1px solid #d4edda', borderRadius: 12, padding: 16, backgroundColor: '#f0fff4' }}>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Renda</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#27ae60' }}>
              R$ {totalIncome.toFixed(2)}
            </div>
            {totalIncome === 0 && (
              <Link href="/incomes" style={{ fontSize: 11, color: '#27ae60' }}>+ Cadastrar renda</Link>
            )}
          </div>

          <div style={{ border: '1px solid #fde8e8', borderRadius: 12, padding: 16, backgroundColor: '#fff8f8' }}>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Gastos</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#e74c3c' }}>
              R$ {totalExpenses.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>
              👫 R$ {sharedExpenses.toFixed(2)} compartilhado
            </div>
          </div>

          <div style={{
            border: `1px solid ${balance_display === null ? '#ddd' : balance_display >= 0 ? '#d4edda' : '#fde8e8'}`,
            borderRadius: 12, padding: 16,
            backgroundColor: balance_display === null ? '#fafafa' : balance_display >= 0 ? '#f0fff4' : '#fff8f8'
          }}>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Saldo</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: balance_display === null ? '#999' : balance_display >= 0 ? '#27ae60' : '#e74c3c' }}>
              {balance_display === null ? '—' : `R$ ${balance_display.toFixed(2)}`}
            </div>
            {balance_display === null && (
              <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>Cadastre sua renda</div>
            )}
          </div>
        </div>

        {/* Orçamento do mês */}
        {budgetSummary && (
          <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 'bold', fontSize: 14 }}>💰 Orçamento do mês</span>
              <Link href="/budgets" style={{ fontSize: 12, color: '#3498db' }}>Ver detalhes →</Link>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#666', marginBottom: 6 }}>
              <span>R$ {budgetSummary.spent.toFixed(2)} gasto</span>
              <span>R$ {budgetSummary.total.toFixed(2)} orçado</span>
            </div>
            <div style={{ width: '100%', height: 8, backgroundColor: '#f0f0f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min((budgetSummary.spent / budgetSummary.total) * 100, 100)}%`,
                height: '100%',
                backgroundColor: budgetSummary.spent > budgetSummary.total ? '#e74c3c' : budgetSummary.spent / budgetSummary.total > 0.8 ? '#f39c12' : '#2ecc71',
                borderRadius: 10,
              }} />
            </div>
            {budgetSummary.spent > budgetSummary.total && (
              <div style={{ fontSize: 12, color: '#e74c3c', marginTop: 6 }}>
                ⚠️ Orçamento estourado em R$ {(budgetSummary.spent - budgetSummary.total).toFixed(2)}
              </div>
            )}
          </div>
        )}

        {/* Top categorias do mês */}
        {topCategories.length > 0 && (
          <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 'bold', fontSize: 14 }}>📊 Top categorias este mês</span>
              <Link href="/analytics" style={{ fontSize: 12, color: '#3498db' }}>Ver tudo →</Link>
            </div>
            {topCategories.map((cat, i) => {
              const pct = totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0;
              return (
                <div key={i} style={{ marginBottom: i < topCategories.length - 1 ? 12 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>{cat.icon} {cat.name}</span>
                    <span style={{ fontWeight: 'bold' }}>R$ {cat.amount.toFixed(2)} <span style={{ color: '#999', fontWeight: 'normal' }}>({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div style={{ width: '100%', height: 5, backgroundColor: '#f0f0f0', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: cat.color || '#3498db', borderRadius: 10 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Acerto entre casal — CORRIGIDO: usa partnerName real */}
        {hasPartner && (
          <Link href="/balances" style={{ textDecoration: 'none' }}>
            <div style={{
              border: balance ? '1px solid #f39c12' : '1px solid #d4edda',
              borderRadius: 12, padding: 16, marginBottom: 16,
              backgroundColor: balance ? '#fffdf0' : '#f0fff4',
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: 14 }}>🤝 Acerto de contas</div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                    {balance
                      ? (balance.iOwe
                        ? `Você deve R$ ${balance.amount.toFixed(2)} para ${partnerName}`
                        : `${partnerName} deve R$ ${balance.amount.toFixed(2)} para você`)
                      : `Você e ${partnerName} estão quites! 🎉`}
                  </div>
                </div>
                <span style={{ color: '#999', fontSize: 18 }}>→</span>
              </div>
            </div>
          </Link>
        )}

        {/* Próximas recorrências */}
        {upcomingRecurrences.length > 0 && (
          <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 'bold', fontSize: 14 }}>🔁 Próximas contas (7 dias)</span>
              <Link href="/recurrences" style={{ fontSize: 12, color: '#3498db' }}>Ver todas →</Link>
            </div>
            {upcomingRecurrences.map((r) => {
              const overdue = r.next_date <= today;
              return (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <div>
                    <span style={{ fontSize: 14 }}>🔁 {r.name || '—'}</span>
                    <div style={{ fontSize: 12, color: overdue ? '#e74c3c' : '#999' }}>
                      {new Date(r.next_date + 'T12:00:00').toLocaleDateString('pt-BR')} · {daysUntil(r.next_date)}
                    </div>
                  </div>
                  <span style={{ fontWeight: 'bold', color: '#e74c3c', fontSize: 14 }}>
                    R$ {Number(r.amount || 0).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Metas em progresso */}
        {activeGoals.length > 0 && (
          <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 'bold', fontSize: 14 }}>🎯 Metas em andamento</span>
              <Link href="/goals" style={{ fontSize: 12, color: '#3498db' }}>Ver todas →</Link>
            </div>
            {activeGoals.map((g) => {
              const pct = Number(g.target_amount) > 0 ? (Number(g.current_amount) / Number(g.target_amount)) * 100 : 0;
              return (
                <div key={g.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>{g.type === 'shared' ? '👫' : '👤'} {g.name}</span>
                    <span style={{ color: '#666' }}>R$ {Number(g.current_amount).toFixed(0)} / R$ {Number(g.target_amount).toFixed(0)}</span>
                  </div>
                  <div style={{ width: '100%', height: 6, backgroundColor: '#f0f0f0', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#3498db', borderRadius: 10 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Navegação rápida */}
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
          <p style={{ fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Módulos</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { href: '/transactions', icon: '💳', label: 'Gastos' },
              { href: '/budgets', icon: '💰', label: 'Orçamento' },
              { href: '/incomes', icon: '💵', label: 'Renda' },
              { href: '/goals', icon: '🎯', label: 'Metas' },
              { href: '/credit-cards', icon: '💳', label: 'Cartões' },
              { href: '/accounts', icon: '🏦', label: 'Contas' },
              { href: '/recurrences', icon: '🔁', label: 'Recorrências' },
              { href: '/analytics', icon: '📊', label: 'Analytics' },
              { href: '/financings', icon: '🏠', label: 'Financiamentos' },
              { href: '/balances', icon: '🤝', label: 'Acerto' },
              { href: '/categories', icon: '🏷️', label: 'Categorias' },
              { href: '/simulator', icon: '🧮', label: 'Simulador' },
              { href: '/setup', icon: '⚙️', label: 'Configurar' },
            ].map(({ href, icon, label }) => (
              <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                <div style={{
                  padding: '12px 4px', border: '1px solid #eee', borderRadius: 10,
                  textAlign: 'center', cursor: 'pointer', backgroundColor: 'white',
                }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
                  <div style={{ fontSize: 11, color: '#555' }}>{label}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}