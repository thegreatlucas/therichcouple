'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Budget {
  id: string;
  category_id: string;
  amount: number;
  month: string;
  categories: {
    name: string;
    icon: string;
    color: string;
  };
}

interface CategorySpending {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  budget: number;
  spent: number;
  remaining: number;
  percentage: number;
}

export default function BudgetsPage() {
  const [user, setUser] = useState<any>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [spending, setSpending] = useState<CategorySpending[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7) // YYYY-MM
  );
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    categoryId: '',
    amount: ''
  });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (householdId) {
      loadBudgets();
      calculateSpending();
    }
  }, [householdId, selectedMonth]);

  async function loadInitialData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setUser(user);

    const { data: members } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (members) {
      setHouseholdId(members.household_id);
    }

    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .eq('household_id', members.household_id)
      .order('name');
    setCategories(cats || []);

    setLoading(false);
  }

  async function loadBudgets() {
    if (!householdId) return;

    const monthDate = `${selectedMonth}-01`;

    const { data, error } = await supabase
      .from('budgets')
      .select(`
        *,
        categories(name, icon, color)
      `)
      .eq('household_id', householdId)
      .eq('month', monthDate);

    if (error) {
      console.error('Erro ao carregar orçamentos:', error);
      return;
    }

    setBudgets(data || []);
  }

  async function calculateSpending() {
    if (!householdId) return;

    const [year, month] = selectedMonth.split('-');
    const firstDay = `${year}-${month}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

    // Busca gastos do mês
    const { data: transactions } = await supabase
      .from('transactions')
      .select('category_id, amount, categories(name, icon, color)')
      .eq('household_id', householdId)
      .gte('date', firstDay)
      .lte('date', lastDay);

    // Agrupa por categoria
    const spendingByCategory = new Map<string, CategorySpending>();

    transactions?.forEach((t: any) => {
      if (!t.category_id) return;

      const existing = spendingByCategory.get(t.category_id);
      if (existing) {
        existing.spent += t.amount;
      } else {
        spendingByCategory.set(t.category_id, {
          categoryId: t.category_id,
          categoryName: t.categories?.name || 'Sem nome',
          categoryIcon: t.categories?.icon || '📁',
          categoryColor: t.categories?.color || '#3498db',
          budget: 0,
          spent: t.amount,
          remaining: 0,
          percentage: 0
        });
      }
    });

    // Adiciona informações de orçamento
    budgets.forEach((budget) => {
      const spending = spendingByCategory.get(budget.category_id);
      if (spending) {
        spending.budget = budget.amount;
        spending.remaining = budget.amount - spending.spent;
        spending.percentage = (spending.spent / budget.amount) * 100;
      } else {
        spendingByCategory.set(budget.category_id, {
          categoryId: budget.category_id,
          categoryName: budget.categories.name,
          categoryIcon: budget.categories.icon,
          categoryColor: budget.categories.color,
          budget: budget.amount,
          spent: 0,
          remaining: budget.amount,
          percentage: 0
        });
      }
    });

    setSpending(Array.from(spendingByCategory.values()));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!householdId || !formData.categoryId || !formData.amount) {
      alert('⚠️ Preencha todos os campos');
      return;
    }

    const monthDate = `${selectedMonth}-01`;

    const { error } = await supabase
      .from('budgets')
      .upsert({
        household_id: householdId,
        category_id: formData.categoryId,
        amount: parseFloat(formData.amount),
        month: monthDate
      }, { onConflict: 'household_id,category_id,month' });

    if (error) {
      alert('❌ Erro ao salvar: ' + error.message);
      return;
    }

    setFormData({ categoryId: '', amount: '' });
    setShowForm(false);
    loadBudgets();
    calculateSpending();
    alert('✅ Orçamento salvo!');
  }

  async function deleteBudget(budgetId: string) {
    if (!confirm('Tem certeza que deseja deletar este orçamento?')) return;

    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('id', budgetId);

    if (!error) {
      loadBudgets();
      calculateSpending();
    }
  }

  function getProgressColor(percentage: number) {
    if (percentage < 50) return '#2ecc71';
    if (percentage < 80) return '#f39c12';
    if (percentage < 100) return '#e67e22';
    return '#e74c3c';
  }

  if (loading) {
    return <main style={{ padding: 16 }}>Carregando...</main>;
  }

  const totalBudget = spending.reduce((sum, s) => sum + s.budget, 0);
  const totalSpent = spending.reduce((sum, s) => sum + s.spent, 0);
  const totalRemaining = totalBudget - totalSpent;

  return (
    <main style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 8 }}>💰 Orçamento</h1>
        <p style={{ color: '#666', fontSize: 14 }}>Defina limites de gastos por categoria</p>
      </div>

      {/* Seletor de mês */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center' }}>
        <label style={{ fontWeight: 'bold' }}>📅 Mês:</label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          style={{
            padding: 8,
            fontSize: 16,
            borderRadius: 8,
            border: '1px solid #ddd'
          }}
        />
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            marginLeft: 'auto',
            padding: '8px 16px',
            backgroundColor: showForm ? '#e74c3c' : '#2ecc71',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          {showForm ? '✖️ Cancelar' : '➕ Definir Orçamento'}
        </button>
      </div>

      {/* Resumo geral */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 24
      }}>
        <div style={{
          backgroundColor: '#e3f2fd',
          padding: 16,
          borderRadius: 8,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>Orçamento Total</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#3498db' }}>
            R$ {totalBudget.toFixed(2)}
          </div>
        </div>
        <div style={{
          backgroundColor: '#ffebee',
          padding: 16,
          borderRadius: 8,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>Gasto Total</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#e74c3c' }}>
            R$ {totalSpent.toFixed(2)}
          </div>
        </div>
        <div style={{
          backgroundColor: totalRemaining >= 0 ? '#e8f5e9' : '#ffebee',
          padding: 16,
          borderRadius: 8,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>Restante</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: totalRemaining >= 0 ? '#2ecc71' : '#e74c3c' }}>
            R$ {totalRemaining.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          style={{
            backgroundColor: '#f5f5f5',
            padding: 20,
            borderRadius: 8,
            marginBottom: 24
          }}
        >
          <h3 style={{ marginTop: 0 }}>Definir Orçamento</h3>
          
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Categoria:
            </label>
            <select
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              style={{
                width: '100%',
                padding: 12,
                fontSize: 16,
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
              required
            >
              <option value="">Selecione...</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
              Valor do orçamento (R$):
            </label>
            <input
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="500.00"
              step="0.01"
              min="0.01"
              style={{
                width: '100%',
                padding: 12,
                fontSize: 16,
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
              required
            />
          </div>

          <button
            type="submit"
            style={{
              padding: '12px 24px',
              backgroundColor: '#2ecc71',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            💾 Salvar Orçamento
          </button>
        </form>
      )}

      {/* Lista de orçamentos com progress bars */}
      <div>
        <h2>Categorias</h2>
        {spending.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#666', padding: 32 }}>
            Nenhum orçamento definido para este mês.
          </p>
        ) : (
          spending.map((item) => (
            <div
              key={item.categoryId}
              style={{
                border: '1px solid #ddd',
                padding: 16,
                marginBottom: 12,
                borderRadius: 8,
                backgroundColor: 'white'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      fontSize: 32,
                      width: 50,
                      height: 50,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: item.categoryColor,
                      borderRadius: 8
                    }}
                  >
                    {item.categoryIcon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: 18 }}>{item.categoryName}</div>
                    <div style={{ fontSize: 14, color: '#666' }}>
                      R$ {item.spent.toFixed(2)} de R$ {item.budget.toFixed(2)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const budget = budgets.find(b => b.category_id === item.categoryId);
                    if (budget) deleteBudget(budget.id);
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#e74c3c',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                >
                  🗑️
                </button>
              </div>

              {/* Progress bar */}
              <div style={{
                width: '100%',
                height: 24,
                backgroundColor: '#f0f0f0',
                borderRadius: 12,
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div
                  style={{
                    width: `${Math.min(item.percentage, 100)}%`,
                    height: '100%',
                    backgroundColor: getProgressColor(item.percentage),
                    transition: 'width 0.3s ease'
                  }}
                />
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontWeight: 'bold',
                  fontSize: 12,
                  color: item.percentage > 50 ? 'white' : '#333'
                }}>
                  {item.percentage.toFixed(0)}%
                </div>
              </div>

              {/* Alerta se ultrapassou */}
              {item.percentage >= 100 && (
                <div style={{
                  marginTop: 8,
                  padding: 8,
                  backgroundColor: '#ffebee',
                  borderRadius: 4,
                  fontSize: 14,
                  color: '#c62828',
                  fontWeight: 'bold'
                }}>
                  ⚠️ Orçamento ultrapassado em R$ {Math.abs(item.remaining).toFixed(2)}!
                </div>
              )}
              {item.percentage >= 80 && item.percentage < 100 && (
                <div style={{
                  marginTop: 8,
                  padding: 8,
                  backgroundColor: '#fff3cd',
                  borderRadius: 4,
                  fontSize: 14,
                  color: '#856404'
                }}>
                  ⚠️ Atenção: Você já gastou {item.percentage.toFixed(0)}% do orçamento!
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <Link href="/dashboard">
          <button style={{ padding: '12px 24px', fontSize: 16 }}>
            ⬅️ Voltar ao Dashboard
          </button>
        </Link>
      </div>
    </main>
  );
}