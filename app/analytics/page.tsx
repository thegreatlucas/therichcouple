'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar } from 'recharts';

interface CategoryData {
  name: string;
  value: number;
  color: string;
  icon: string;
}

interface MonthlyData {
  month: string;
  amount: number;
}

export default function AnalyticsPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [period, setPeriod] = useState('3months');
  const [totalSpent, setTotalSpent] = useState(0);
  const [avgPerDay, setAvgPerDay] = useState(0);
  const [topCategory, setTopCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Carrega household apenas uma vez
  useEffect(() => {
    async function loadHousehold() {
      const { data: { user } } = await supabase.auth.getUser();
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
      setLoading(false);
    }

    loadHousehold();
  }, [router]);

  // Carrega dados quando household ou período mudar
  useEffect(() => {
    if (!householdId) return;

    async function loadAnalytics() {
      const now = new Date();
      let startDate: Date;
      
      switch(period) {
        case '3months':
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
          break;
        case '6months':
          startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      }

      const startDateStr = startDate.toISOString().split('T')[0];

      const { data: transactions, error } = await supabase
        .from('transactions')
        .select(`
          *,
          categories(name, icon, color)
        `)
        .eq('household_id', householdId)
        .gte('date', startDateStr)
        .order('date', { ascending: true });

      if (error) {
        console.error('Erro ao buscar transações:', error);
        return;
      }

      if (!transactions || transactions.length === 0) {
        setCategoryData([]);
        setMonthlyData([]);
        setInsights(['📭 Nenhum gasto registrado neste período']);
        setTotalSpent(0);
        setAvgPerDay(0);
        return;
      }

      // Processa dados por categoria
      const categoryMap = new Map<string, CategoryData>();
      let total = 0;

      transactions.forEach((t) => {
        total += t.amount;
        const catName = t.categories?.name || 'Sem categoria';
        const existing = categoryMap.get(catName);
        
        if (existing) {
          existing.value += t.amount;
        } else {
          categoryMap.set(catName, {
            name: catName,
            value: t.amount,
            color: t.categories?.color || '#95a5a6',
            icon: t.categories?.icon || '📁'
          });
        }
      });

      const catData = Array.from(categoryMap.values())
        .sort((a, b) => b.value - a.value);
      setCategoryData(catData);
      setTotalSpent(total);

      // Processa dados mensais
      const monthlyMap = new Map<string, number>();
      transactions.forEach((t) => {
        const month = t.date.slice(0, 7);
        monthlyMap.set(month, (monthlyMap.get(month) || 0) + t.amount);
      });

      const monthlyArray = Array.from(monthlyMap.entries())
        .map(([month, amount]) => ({
          month: new Date(month + '-01').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          amount: amount
        }));
      
      setMonthlyData(monthlyArray);

      // Calcula insights
      const days = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const avgDay = total / days;
      setAvgPerDay(avgDay);

      if (catData.length > 0) {
        setTopCategory(catData[0].name);
        generateInsights(catData, total, avgDay, monthlyArray);
      }
    }

    loadAnalytics();
  }, [householdId, period]);

  function generateInsights(catData: CategoryData[], total: number, avgDay: number, monthly: MonthlyData[]) {
    const insightsList: string[] = [];

    if (catData.length > 0) {
      const topCat = catData[0];
      const percentage = ((topCat.value / total) * 100).toFixed(0);
      insightsList.push(`${topCat.icon} Você gasta ${percentage}% do seu dinheiro em ${topCat.name}`);
    }

    insightsList.push(`💸 Sua média de gasto é R$ ${avgDay.toFixed(2)} por dia`);

    if (monthly.length >= 2) {
      const lastMonth = monthly[monthly.length - 1].amount;
      const prevMonth = monthly[monthly.length - 2].amount;
      const diff = lastMonth - prevMonth;
      const diffPercent = ((diff / prevMonth) * 100).toFixed(0);
      
      if (diff > 0) {
        insightsList.push(`📈 Seus gastos aumentaram ${diffPercent}% no último mês`);
      } else if (diff < 0) {
        insightsList.push(`📉 Parabéns! Você economizou ${Math.abs(parseFloat(diffPercent))}% no último mês`);
      } else {
        insightsList.push(`➡️ Seus gastos se mantiveram estáveis no último mês`);
      }
    }

    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const projection = avgDay * daysInMonth;
    insightsList.push(`🔮 Projeção para o mês: R$ ${projection.toFixed(2)}`);

    if (catData.length >= 3) {
      const top3 = catData.slice(0, 3);
      const top3Total = top3.reduce((sum, cat) => sum + cat.value, 0);
      const top3Percent = ((top3Total / total) * 100).toFixed(0);
      insightsList.push(`🎯 ${top3Percent}% dos gastos estão em apenas 3 categorias`);
    }

    setInsights(insightsList);
  }

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({
    cx, cy, midAngle, innerRadius, outerRadius, percent
  }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.05) return null;

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontWeight="bold"
        fontSize="14"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  if (loading) {
    return (
      <main style={{ padding: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <h2>Carregando Analytics...</h2>
      </main>
    );
  }

  if (!householdId) {
    return (
      <main style={{ padding: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2>Você não está em nenhum casal ainda</h2>
        <Link href="/dashboard">
          <button style={{ padding: '12px 24px', marginTop: 16 }}>Voltar</button>
        </Link>
      </main>
    );
  }

  return (
    <>
      <Header title="Analytics" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 8 }}>📊 Analytics & Insights</h1>
        <p style={{ color: '#666', fontSize: 14 }}>Análise detalhada dos seus gastos</p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ fontWeight: 'bold', marginRight: 12 }}>📅 Período:</label>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          style={{
            padding: 8,
            fontSize: 16,
            borderRadius: 8,
            border: '1px solid #ddd'
          }}
        >
          <option value="3months">Últimos 3 meses</option>
          <option value="6months">Últimos 6 meses</option>
          <option value="year">Último ano</option>
        </select>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 32
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: 20,
          borderRadius: 12,
          color: 'white',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: 14, marginBottom: 8, opacity: 0.9 }}>Total Gasto</div>
          <div style={{ fontSize: 28, fontWeight: 'bold' }}>R$ {totalSpent.toFixed(2)}</div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          padding: 20,
          borderRadius: 12,
          color: 'white',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: 14, marginBottom: 8, opacity: 0.9 }}>Média por Dia</div>
          <div style={{ fontSize: 28, fontWeight: 'bold' }}>R$ {avgPerDay.toFixed(2)}</div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          padding: 20,
          borderRadius: 12,
          color: 'white',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: 14, marginBottom: 8, opacity: 0.9 }}>Top Categoria</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{topCategory || 'N/A'}</div>
        </div>
      </div>

      <div style={{
        backgroundColor: '#fff3cd',
        border: '2px solid #ffc107',
        borderRadius: 12,
        padding: 20,
        marginBottom: 32
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          💡 Insights Inteligentes
        </h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {insights.map((insight, i) => (
            <div
              key={i}
              style={{
                backgroundColor: 'white',
                padding: 12,
                borderRadius: 8,
                fontSize: 15,
                border: '1px solid #f39c12'
              }}
            >
              {insight}
            </div>
          ))}
        </div>
      </div>

      {categoryData.length > 0 && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
            gap: 24,
            marginBottom: 32
          }}>
            <div style={{
              backgroundColor: 'white',
              padding: 24,
              borderRadius: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>🥧 Gastos por Categoria</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomizedLabel}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                  />
                </PieChart>
              </ResponsiveContainer>
              
              <div style={{ marginTop: 16 }}>
                {categoryData.map((cat, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 8,
                      fontSize: 14
                    }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        backgroundColor: cat.color,
                        borderRadius: 4
                      }}
                    />
                    <span>{cat.icon} {cat.name}</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 'bold' }}>
                      R$ {cat.value.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {monthlyData.length > 0 && (
              <div style={{
                backgroundColor: 'white',
                padding: 24,
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>📈 Evolução Mensal</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      stroke="#8884d8"
                      strokeWidth={3}
                      dot={{ r: 6, fill: '#8884d8' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div style={{
            backgroundColor: 'white',
            padding: 24,
            borderRadius: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            marginBottom: 24
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>🏆 Ranking de Categorias</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip
                  formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div style={{ textAlign: 'center' }}>
        <Link href="/dashboard">
          <button style={{ padding: '12px 24px', fontSize: 16 }}>
            ⬅️ Voltar ao Dashboard
          </button>
        </Link>
      </div>
    </main>
  </>
  );
}