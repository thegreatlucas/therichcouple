// lib/monthlyClosing.ts
// Lógica de fechamento mensal — calcula e salva o snapshot do mês

import { supabase } from './supabaseClient';

export interface ClosingSnapshot {
  householdId: string;
  month: Date;
  closedBy: string;
}

export async function performMonthlyClosing({ householdId, month, closedBy }: ClosingSnapshot) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).toISOString().split('T')[0];
  const lastDay  = new Date(month.getFullYear(), month.getMonth() + 1, 0).toISOString().split('T')[0];
  const monthStr = firstDay; // 2026-01-01

  // 1. Busca membros do household
  const { data: members } = await supabase
    .from('household_members')
    .select('user_id')
    .eq('household_id', householdId);

  const userIds = (members || []).map((m: any) => m.user_id);
  const [user1Id, user2Id] = userIds;

  // 2. Renda total do household no mês
  const { data: incomes } = await supabase
    .from('incomes')
    .select('amount')
    .eq('household_id', householdId)
    .gte('month', firstDay)
    .lte('month', lastDay);

  const totalIncome = (incomes || []).reduce((s: number, i: any) => s + Number(i.amount), 0);

  // 3. Gastos por usuário
  const eff = (t: any) =>
    t.installments_count > 1 && t.installment_value
      ? Number(t.installment_value)
      : Number(t.amount);

  let user1Expenses = 0;
  let user2Expenses = 0;

  if (user1Id) {
    const { data: txs1 } = await supabase
      .from('transactions')
      .select('amount, installment_value, installments_count')
      .eq('household_id', householdId)
      .eq('user_id', user1Id)
      .gte('date', firstDay)
      .lte('date', lastDay);
    user1Expenses = (txs1 || []).reduce((s: number, t: any) => s + eff(t), 0);
  }

  if (user2Id) {
    const { data: txs2 } = await supabase
      .from('transactions')
      .select('amount, installment_value, installments_count')
      .eq('household_id', householdId)
      .eq('user_id', user2Id)
      .gte('date', firstDay)
      .lte('date', lastDay);
    user2Expenses = (txs2 || []).reduce((s: number, t: any) => s + eff(t), 0);
  }

  const totalExpenses = user1Expenses + user2Expenses;
  const balance = totalIncome - totalExpenses;

  // 4. Saldo de acerto entre o casal
  const { data: balRows } = await supabase
    .from('balances')
    .select('*')
    .eq('household_id', householdId);

  let settlementAmount = 0;
  for (const row of balRows || []) {
    settlementAmount += Number(row.amount);
  }

  // 5. Salva o snapshot (upsert — permite refechar o mesmo mês)
  const { error } = await supabase
    .from('monthly_closings')
    .upsert({
      household_id: householdId,
      month: monthStr,
      total_income: totalIncome,
      total_expenses: totalExpenses,
      balance,
      user1_id: user1Id || null,
      user1_expenses: user1Expenses,
      user2_id: user2Id || null,
      user2_expenses: user2Expenses,
      settlement_amount: settlementAmount,
      closed_by: closedBy,
      closed_at: new Date().toISOString(),
    }, { onConflict: 'household_id,month' });

  if (error) throw error;

  return {
    month: monthStr,
    totalIncome,
    totalExpenses,
    balance,
    user1Expenses,
    user2Expenses,
    settlementAmount,
  };
}

export function getPreviousMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

export function getCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}