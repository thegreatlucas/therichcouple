import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // Aceita chamadas via cron (GET sem auth) ou manual (POST com Bearer token)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const today = new Date().toISOString().split('T')[0];

  try {
    // Busca todas as regras ativas com next_date <= hoje
    const { data: rules, error: rulesError } = await supabase
      .from('recurrence_rules')
      .select(`
        *,
        transactions (
          id,
          amount,
          description,
          split,
          payment_method,
          category_id,
          account_id,
          household_id,
          user_id,
          payer_id,
          is_subscription
        )
      `)
      .eq('active', true)
      .lte('next_date', today);

    if (rulesError) throw rulesError;
    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhuma recorrência pendente.', processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const results: { rule_id: string; status: string; description?: string; error?: string }[] = [];

    for (const rule of rules) {
      const baseTx = rule.transactions;

      if (!baseTx) {
        results.push({ rule_id: rule.id, status: 'skipped', description: 'Transação base não encontrada' });
        continue;
      }

      // 1. Cria a nova transação clonando a base
      const { error: txError } = await supabase.from('transactions').insert({
        household_id: baseTx.household_id,
        user_id: baseTx.user_id,
        payer_id: baseTx.payer_id,
        account_id: baseTx.account_id,
        category_id: baseTx.category_id,
        amount: baseTx.amount,
        description: baseTx.description,
        date: rule.next_date,
        payment_method: baseTx.payment_method || 'cash',
        split: baseTx.split || 'individual',
        is_recurring: true,
        is_subscription: baseTx.is_subscription || false,
      });

      if (txError) {
        results.push({ rule_id: rule.id, status: 'error', description: baseTx.description, error: txError.message });
        continue;
      }

      // 2. Se split === 'shared', atualiza o balance entre parceiros
      if (baseTx.split === 'shared') {
        const splitAmount = Number(baseTx.amount) / 2;

        // Busca o outro membro do household
        const { data: members } = await supabase
          .from('household_members')
          .select('user_id')
          .eq('household_id', baseTx.household_id);

        const otherUserId = (members || []).find((m: any) => m.user_id !== baseTx.user_id)?.user_id;

        if (otherUserId) {
          // Mesma lógica de acumulação do new/page.tsx
          const { data: balA } = await supabase
            .from('balances')
            .select('*')
            .eq('household_id', baseTx.household_id)
            .eq('from_user_id', otherUserId)
            .eq('to_user_id', baseTx.user_id)
            .maybeSingle();

          const { data: balB } = await supabase
            .from('balances')
            .select('*')
            .eq('household_id', baseTx.household_id)
            .eq('from_user_id', baseTx.user_id)
            .eq('to_user_id', otherUserId)
            .maybeSingle();

          if (balA) {
            await supabase.from('balances').update({ amount: Number(balA.amount) + splitAmount }).eq('id', balA.id);
          } else if (balB) {
            const newAmount = Number(balB.amount) - splitAmount;
            if (newAmount > 0.001) {
              await supabase.from('balances').update({ amount: newAmount }).eq('id', balB.id);
            } else if (newAmount < -0.001) {
              await supabase.from('balances').delete().eq('id', balB.id);
              await supabase.from('balances').insert({
                household_id: baseTx.household_id,
                from_user_id: otherUserId,
                to_user_id: baseTx.user_id,
                amount: Math.abs(newAmount),
              });
            } else {
              await supabase.from('balances').delete().eq('id', balB.id);
            }
          } else {
            await supabase.from('balances').insert({
              household_id: baseTx.household_id,
              from_user_id: otherUserId,
              to_user_id: baseTx.user_id,
              amount: splitAmount,
            });
          }
        }
      }

      // 3. Avança o next_date da regra
      const nextDate = new Date(rule.next_date + 'T12:00:00');

      if (rule.frequency === 'monthly') {
        nextDate.setMonth(nextDate.getMonth() + 1);
        // Respeita o dia fixo configurado (ex: sempre dia 10)
        if (rule.day_of_month) {
          const maxDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
          nextDate.setDate(Math.min(rule.day_of_month, maxDay));
        }
      } else if (rule.frequency === 'weekly') {
        nextDate.setDate(nextDate.getDate() + 7);
      } else if (rule.frequency === 'yearly') {
        nextDate.setFullYear(nextDate.getFullYear() + 1);
      }

      await supabase
        .from('recurrence_rules')
        .update({ next_date: nextDate.toISOString().split('T')[0] })
        .eq('id', rule.id);

      results.push({ rule_id: rule.id, status: 'ok', description: baseTx.description });
    }

    const processed = results.filter(r => r.status === 'ok').length;
    const errors = results.filter(r => r.status === 'error').length;

    console.log(`[process-recurrences] ${today} — ${processed} geradas, ${errors} erros`);

    return new Response(JSON.stringify({ date: today, processed, errors, results }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err: any) {
    console.error('[process-recurrences] Erro crítico:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});