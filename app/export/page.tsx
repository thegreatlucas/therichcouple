'use client';
// app/export/page.tsx — Exportar relatório mensal (PDF via print ou CSV)

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Header from '@/app/components/Header';

export default function ExportPage() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: member } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).single();
      if (member) setHouseholdId(member.household_id);
    }
    init();
  }, []);

  async function fetchData() {
    if (!householdId) return null;
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    const [txsRes, incomesRes] = await Promise.all([
      supabase.from('transactions').select('*, categories(name, icon)').eq('household_id', householdId).gte('date', start).lte('date', end).order('date', { ascending: true }),
      supabase.from('incomes').select('*').eq('household_id', householdId).order('name'),
    ]);
    return { transactions: txsRes.data || [], incomes: incomesRes.data || [], start, end };
  }

  function getDisplayValue(t: any) {
    return t.installments_count > 1 && t.installment_value ? Number(t.installment_value) : Number(t.amount);
  }

  function downloadCSV(data: any) {
    const { transactions, incomes, start } = data;
    const totalIncome = incomes.reduce((s: number, i: any) => s + Number(i.amount), 0);
    const totalExpense = transactions.reduce((s: number, t: any) => s + getDisplayValue(t), 0);
    const periodo = new Date(start + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const rows = [
      ['The Rich Couple — Relatório', periodo],
      [],
      ['── RECEITAS ──'],
      ['Nome', 'Valor (R$)', 'Frequência'],
      ...incomes.map((i: any) => [i.name, Number(i.amount).toFixed(2), i.frequency || 'mensal']),
      ['TOTAL RECEITAS', totalIncome.toFixed(2)],
      [],
      ['── DESPESAS ──'],
      ['Data', 'Descrição', 'Categoria', 'Valor (R$)', 'Divisão', 'Pagamento'],
      ...transactions.map((t: any) => [
        new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR'),
        t.description,
        t.categories?.name || 'Sem categoria',
        getDisplayValue(t).toFixed(2),
        t.split === 'shared' ? 'Compartilhado' : 'Individual',
        t.payment_method || '',
      ]),
      ['TOTAL DESPESAS', totalExpense.toFixed(2)],
      [],
      ['SALDO DO MÊS', (totalIncome - totalExpense).toFixed(2)],
    ];

    const csv = rows.map((r) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `richcouple-${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printPDF(data: any) {
    const { transactions, incomes, start } = data;
    const totalIncome = incomes.reduce((s: number, i: any) => s + Number(i.amount), 0);
    const totalExpense = transactions.reduce((s: number, t: any) => s + getDisplayValue(t), 0);
    const saldo = totalIncome - totalExpense;
    const periodo = new Date(start + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const catMap = new Map<string, number>();
    transactions.forEach((t: any) => {
      const cat = `${t.categories?.icon || ''} ${t.categories?.name || 'Sem categoria'}`;
      catMap.set(cat, (catMap.get(cat) || 0) + getDisplayValue(t));
    });
    const cats = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]);

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>The Rich Couple — ${periodo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;color:#1a1a1a;font-size:12px;padding:32px}
h1{font-size:22px;margin-bottom:4px}
.sub{color:#666;margin-bottom:24px}
.summary{display:flex;gap:12px;margin-bottom:28px}
.card{flex:1;border:1px solid #ddd;border-radius:8px;padding:12px 14px}
.card .lbl{font-size:10px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}
.card .val{font-size:20px;font-weight:800}
.green{color:#2ecc71}.red{color:#e74c3c}.blue{color:#3498db}.orange{color:#e67e22}
h2{font-size:13px;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eee;text-transform:uppercase;letter-spacing:.5px}
table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:11px}
th{background:#f5f5f5;padding:7px 8px;text-align:left;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.4px}
td{padding:6px 8px;border-bottom:1px solid #f8f8f8}
.tr{text-align:right}
.tag{display:inline-block;padding:2px 6px;border-radius:10px;font-size:9px;font-weight:600}
.shared{background:#ede7f6;color:#7b1fa2}.indv{background:#e8f5e9;color:#2e7d32}
.bar-row{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.bar-lbl{width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
.bar-bg{flex:1;height:8px;background:#f0f0f0;border-radius:4px;overflow:hidden}
.bar-fill{height:100%;background:#3498db;border-radius:4px}
.bar-val{width:70px;text-align:right;font-size:11px;font-weight:700}
footer{margin-top:32px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#aaa;text-align:center}
@media print{body{padding:12px}@page{margin:1cm}}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
  <div><h1>💰 The Rich Couple</h1><div class="sub">Relatório mensal — ${periodo}</div></div>
  <div style="font-size:10px;color:#aaa;text-align:right">Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
</div>
<div class="summary">
  <div class="card"><div class="lbl">Receitas</div><div class="val green">R$ ${totalIncome.toFixed(2)}</div></div>
  <div class="card"><div class="lbl">Despesas</div><div class="val red">R$ ${totalExpense.toFixed(2)}</div></div>
  <div class="card"><div class="lbl">Saldo</div><div class="val ${saldo >= 0 ? 'green' : 'red'}">R$ ${saldo.toFixed(2)}</div></div>
  <div class="card"><div class="lbl">Transações</div><div class="val blue">${transactions.length}</div></div>
</div>
${cats.length > 0 ? `<h2>📊 Gastos por categoria</h2><div style="margin-bottom:24px">
${cats.slice(0, 8).map(([cat, val]) => `<div class="bar-row">
  <div class="bar-lbl">${cat}</div>
  <div class="bar-bg"><div class="bar-fill" style="width:${totalExpense > 0 ? Math.round(val / totalExpense * 100) : 0}%"></div></div>
  <div class="bar-val">R$ ${val.toFixed(2)}</div>
</div>`).join('')}
</div>` : ''}
${incomes.length > 0 ? `<h2>📈 Receitas</h2>
<table><tr><th>Fonte</th><th class="tr">Valor</th><th>Frequência</th></tr>
${incomes.map((i: any) => `<tr><td>${i.name}</td><td class="tr"><b>R$ ${Number(i.amount).toFixed(2)}</b></td><td>${i.frequency || 'mensal'}</td></tr>`).join('')}
<tr style="background:#f9f9f9"><td><b>Total</b></td><td class="tr"><b>R$ ${totalIncome.toFixed(2)}</b></td><td></td></tr>
</table>` : ''}
<h2>💳 Despesas do período (${transactions.length})</h2>
${transactions.length === 0 ? '<p style="color:#888;margin-bottom:24px;font-size:12px">Nenhuma despesa registrada neste período.</p>' : `
<table><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="tr">Valor</th><th>Tipo</th></tr>
${transactions.map((t: any) => {
  const val = getDisplayValue(t);
  return `<tr>
    <td>${new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</td>
    <td>${t.description}${t.installments_count > 1 ? ` <span class="orange">(${t.installments_count}x)</span>` : ''}</td>
    <td>${t.categories?.icon || ''} ${t.categories?.name || '—'}</td>
    <td class="tr"><b>R$ ${val.toFixed(2)}</b></td>
    <td><span class="tag ${t.split === 'shared' ? 'shared' : 'indv'}">${t.split === 'shared' ? '👫 Compartilhado' : '👤 Individual'}</span></td>
  </tr>`;
}).join('')}
<tr style="background:#f5f5f5"><td colspan="3"><b>Total</b></td><td class="tr"><b>R$ ${totalExpense.toFixed(2)}</b></td><td></td></tr>
</table>`}
<footer>The Rich Couple · Gerado em ${new Date().toLocaleString('pt-BR')}</footer>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Habilite pop-ups para gerar o PDF'); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  async function generate() {
    setGenerating(true);
    const data = await fetchData();
    setGenerating(false);
    if (!data) return;
    if (format === 'csv') downloadCSV(data);
    else printPDF(data);
  }

  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const YEARS = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

  return (
    <>
      <Header title="Exportar Relatório" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ color: 'var(--text)', marginBottom: 6 }}>📤 Exportar relatório</h2>
          <p style={{ fontSize: 14, color: 'var(--text3)' }}>Gere um relatório completo com receitas, despesas e saldo do mês.</p>
        </div>

        {/* Período */}
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>📅 Período</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Mês</label>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Ano</label>
              <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Formato */}
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>📄 Formato</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {([
              ['pdf', '🖨️', 'PDF', 'Abre para imprimir\nou salvar como PDF'],
              ['csv', '📊', 'Excel / CSV', 'Planilha compatível com\nExcel e Google Sheets'],
            ] as const).map(([f, icon, label, desc]) => (
              <button key={f} onClick={() => setFormat(f)}
                style={{ padding: '14px 12px', borderRadius: 10, border: format === f ? '2px solid var(--green)' : '1px solid var(--border)', backgroundColor: format === f ? '#f0fff5' : 'var(--surface2)', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'pre-line' }}>{desc}</div>
              </button>
            ))}
          </div>
        </div>

        <button onClick={generate} disabled={generating || !householdId}
          style={{ width: '100%', padding: '15px', backgroundColor: generating ? 'var(--border)' : 'var(--green)', color: 'white', border: 'none', borderRadius: 12, cursor: generating ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 16 }}>
          {generating ? '⏳ Gerando...' : `📤 Gerar ${format.toUpperCase()}`}
        </button>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
          {format === 'pdf' ? 'Uma nova aba abrirá o relatório. Use Ctrl+P para salvar como PDF.' : 'Um arquivo .csv será baixado. Abra no Excel ou Google Sheets.'}
        </p>
      </main>
    </>
  );
}