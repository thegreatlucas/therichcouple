// lib/balance.ts
// Centraliza toda a lógica de atualização de balance entre parceiros.
// Use esta função em qualquer lugar que crie ou delete transações compartilhadas.

import { supabase } from './supabaseClient';

/**
 * Aplica um delta ao balance entre dois usuários.
 *
 * delta > 0: otherUser passa a dever mais para currentUser
 *            (ex: currentUser pagou uma despesa shared)
 *
 * delta < 0: currentUser passa a dever mais para otherUser
 *            (ex: deletou uma despesa shared que currentUser tinha pago)
 */
export async function applyBalanceDelta(
  householdId: string,
  currentUserId: string,
  otherUserId: string,
  delta: number
) {
  if (Math.abs(delta) < 0.001) return;

  // Busca rows existentes nas duas direções
  const { data: rowA } = await supabase
    .from('balances')
    .select('*')
    .eq('household_id', householdId)
    .eq('from_user_id', otherUserId)
    .eq('to_user_id', currentUserId)
    .maybeSingle();

  const { data: rowB } = await supabase
    .from('balances')
    .select('*')
    .eq('household_id', householdId)
    .eq('from_user_id', currentUserId)
    .eq('to_user_id', otherUserId)
    .maybeSingle();

  // Net atual do ponto de vista de currentUser
  // positivo = otherUser deve para mim
  // negativo = eu devo para otherUser
  const currentNet =
    (rowA ? Number(rowA.amount) : 0) - (rowB ? Number(rowB.amount) : 0);
  const newNet = currentNet + delta;

  // Limpa rows existentes
  if (rowA) await supabase.from('balances').delete().eq('id', rowA.id);
  if (rowB) await supabase.from('balances').delete().eq('id', rowB.id);

  // Se zerado, não precisa inserir nada
  if (Math.abs(newNet) < 0.001) return;

  if (newNet > 0) {
    // otherUser deve para currentUser
    await supabase.from('balances').insert({
      household_id: householdId,
      from_user_id: otherUserId,
      to_user_id: currentUserId,
      amount: newNet,
    });
  } else {
    // currentUser deve para otherUser
    await supabase.from('balances').insert({
      household_id: householdId,
      from_user_id: currentUserId,
      to_user_id: otherUserId,
      amount: Math.abs(newNet),
    });
  }
}