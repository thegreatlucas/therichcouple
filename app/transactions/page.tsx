'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function TransactionsPage() {
  const [user, setUser] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [filterPeriod, setFilterPeriod] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    async function loadInitialData() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (!user) {
        router.push('/login');
        return;
      }

      const { data: members } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (members) {
        setHouseholdId(members.household_id);
      }

      if (members) {
        const { data: cats } = await supabase
          .from('categories')
          .select('*')
          .eq('household_id', members.household_id)
          .order('name');
        setCategories(cats || []);
      }

      setLoading(false);
    }

    loadInitialData();
  }, [router]);

  useEffect(() => {
    if (householdId) {
      loadTransactions();
    }
  }, [householdId, filterPeriod, filterCategory]);

  async function loadTransactions() {
    if (!householdId) return;

    // REMOVIDO: users(email) - Causa erro de relacionamento
    let query = supabase
      .from('transactions')
      .select(`
        *,
        categories(name),
        accounts(name)
      `)
      .eq('household_id', householdId)
      .order('date', { ascending: false });

    if (filterPeriod === 'month') {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      query = query.gte('date', firstDay);
    } else if (filterPeriod === 'week') {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      query = query.gte('date', weekAgo);
    }

    if (filterCategory !== 'all') {
      query = query.eq('category_id', filterCategory);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar transações:', error);
      return;
    }

    setTransactions(data || []);
  }

  async function deleteTransaction(id: string) {
    if (!confirm('Tem certeza que deseja deletar este gasto?')) return;

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (!error) {
      setTransactions(transactions.filter(t => t.id !== id));
    }
  }

  if (loading) {
    return <main style={{ padding: 16 }}>Carregando...</main>;
  }

  const total = transactions.reduce((sum, t) => sum + t.amount, 0);

  return (
    <main style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>Meus gastos</h1>
        <Link href="/transactions/new">
          <button style={{ padding: '8px 16px', fontSize: 16 }}>
            ➕ Novo gasto
          </button>
        </Link>
      </div>

      <div style={{ 
        backgroundColor: '#f5f5f5', 
        padding: 16, 
        borderRadius: 8, 
        marginBottom: 24,
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
        alignItems: 'flex-end'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
            📅 Período:
          </label>
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
          >
            <option value="all">Todos</option>
            <option value="week">Última semana</option>
            <option value="month">Este mês</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
            🏷️ Categoria:
          </label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
          >
            <option value="all">Todas</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        {(filterPeriod !== 'all' || filterCategory !== 'all') && (
          <button
            onClick={() => {
              setFilterPeriod('all');
              setFilterCategory('all');
            }}
            style={{ 
              padding: '8px 16px', 
              borderRadius: 4, 
              backgroundColor: '#e74c3c', 
              color: 'white', 
              border: 'none', 
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            ✖️ Limpar filtros
          </button>
        )}
      </div>

      <div style={{ 
        backgroundColor: '#fff3cd', 
        padding: 16, 
        borderRadius: 8, 
        marginBottom: 24,
        textAlign: 'center',
        border: '2px solid #ffc107'
      }}>
        <div style={{ fontSize: 14, color: '#856404', marginBottom: 4 }}>
          Total {filterPeriod === 'month' ? 'deste mês' : filterPeriod === 'week' ? 'da última semana' : 'geral'}
        </div>
        <div style={{ fontSize: 32, fontWeight: 'bold', color: '#e74c3c' }}>
          R$ {total.toFixed(2)}
        </div>
        <div style={{ fontSize: 14, color: '#856404', marginTop: 4 }}>
          {transactions.length} {transactions.length === 1 ? 'transação' : 'transações'}
        </div>
      </div>

      {transactions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#666' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📭</div>
          <p>Nenhum gasto encontrado.</p>
        </div>
      ) : (
        <div>
          {transactions.map((transaction) => (
            <div
              key={transaction.id}
              style={{
                border: '1px solid #ddd',
                padding: 12,
                marginBottom: 8,
                borderRadius: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'white'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: 16 }}>
                  {transaction.description}
                </div>
                <div style={{ fontSize: 14, color: '#666' }}>
                  {transaction.categories?.name || 'Sem categoria'} • {transaction.payment_method}
                </div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                  {new Date(transaction.date).toLocaleDateString('pt-BR', { 
                    day: '2-digit', 
                    month: 'long', 
                    year: 'numeric' 
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#e74c3c' }}>
                  R$ {transaction.amount.toFixed(2)}
                </div>
                <button
                  onClick={() => deleteTransaction(transaction.id)}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: '#ff4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 16
                  }}
                  title="Deletar"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <Link href="/dashboard">
          <button style={{ padding: '12px 24px', fontSize: 16 }}>
            ⬅️ Voltar ao Dashboard
          </button>
        </Link>
      </div>
    </main>
  );
}