'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';
import { useEncryptedInsert } from '@/lib/useEncryptedInsert';

type GoalType = 'individual' | 'shared';
type GoalKind = 'target' | 'monthly';

type Goal = {
  id: string;
  name: string;
  type: GoalType;
  kind?: GoalKind;
  target_amount: number;
  current_amount: number;
  monthly_target?: number;
  deadline: string | null;
  owner_id: string | null;
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeMovement, setActiveMovement] = useState<string | null>(null);
  const [movementForm, setMovementForm] = useState({ amount: '', type: 'deposit' as 'deposit' | 'withdrawal' });
  const [savingMovement, setSavingMovement] = useState(false);
  const [newGoal, setNewGoal] = useState({ name: '', target: '', monthlyTarget: '', deadline: '', type: 'individual' as GoalType, kind: 'target' as GoalKind });
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentMonthSaved, setCurrentMonthSaved] = useState<Record<string, number>>({});
  const router = useRouter();
  const { encryptRecord } = useEncryptedInsert();

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setCurrentUserId(user.id);
    const { data: member } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).single();
    if (!member) { router.push('/setup'); return; }
    setHouseholdId(member.household_id);
    await loadGoals(member.household_id, user.id);
    setLoading(false);
  }

  async function loadGoals(hid: string, uid: string) {
    const { data } = await supabase
      .from('goals')
      .select('*')
      .eq('household_id', hid)
      .or(`type.eq.shared,owner_id.eq.${uid}`)
      .order('created_at', { ascending: false });
    setGoals(data || []);
    await loadCurrentMonthSavings(hid, data || []);
  }

  async function loadCurrentMonthSavings(hid: string, goals: Goal[]) {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    const monthlyGoalIds = goals.filter(g => g.kind === 'monthly' || (g as any).monthly_target > 0).map(g => g.id);
    if (monthlyGoalIds.length === 0) return;

    const { data: movements } = await supabase
      .from('goal_movements')
      .select('*')
      .in('goal_id', monthlyGoalIds)
      .gte('date', firstOfMonth)
      .eq('type', 'deposit');

    const saved: Record<string, number> = {};
    for (const m of movements || []) {
      saved[m.goal_id] = (saved[m.goal_id] || 0) + Number(m.amount);
    }
    setCurrentMonthSaved(saved);
  }

  async function createGoal(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!newGoal.name.trim()) { setErrorMsg('Digite um nome.'); return; }
    if (newGoal.kind === 'target' && (!newGoal.target || parseFloat(newGoal.target) <= 0)) { setErrorMsg('Digite um valor alvo válido.'); return; }
    if (newGoal.kind === 'monthly' && (!newGoal.monthlyTarget || parseFloat(newGoal.monthlyTarget) <= 0)) { setErrorMsg('Digite uma meta mensal válida.'); return; }
    if (!householdId || !currentUserId) return;
    setCreating(true);

    const base: any = {
      household_id: householdId,
      owner_id: newGoal.type === 'individual' ? currentUserId : null,
      type: newGoal.type,
      name: newGoal.name.trim(),
      target_amount: newGoal.kind === 'target' ? parseFloat(newGoal.target) : parseFloat(newGoal.monthlyTarget),
      current_amount: 0,
      deadline: newGoal.deadline || null,
      // Usamos o campo notes (ou similar) para guardar kind e monthly_target
      // Na prática usa target_amount como monthly_target para metas mensais
    };

    // Para metas mensais: target_amount = meta mensal (valor a guardar por mês)
    if (newGoal.kind === 'monthly') {
      base.target_amount = parseFloat(newGoal.monthlyTarget);
    }

    const payload = await encryptRecord(base);
    const { error } = await supabase.from('goals').insert(payload);
    setCreating(false);
    if (error) { setErrorMsg('Erro ao criar: ' + error.message); return; }
    setNewGoal({ name: '', target: '', monthlyTarget: '', deadline: '', type: 'individual', kind: 'target' });
    setShowCreateForm(false);
    await loadGoals(householdId, currentUserId);
  }

  async function saveMovement(goalId: string) {
    const amount = parseFloat(movementForm.amount);
    if (!amount || amount <= 0) { alert('Digite um valor válido.'); return; }
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    if (movementForm.type === 'withdrawal' && amount > goal.current_amount) {
      alert(`Saldo insuficiente. Disponível: R$ ${goal.current_amount.toFixed(2)}`);
      return;
    }
    setSavingMovement(true);
    await supabase.from('goal_movements').insert({ goal_id: goalId, amount, type: movementForm.type, date: new Date().toISOString().split('T')[0] });
    const delta = movementForm.type === 'deposit' ? amount : -amount;
    await supabase.from('goals').update({ current_amount: Math.max(0, goal.current_amount + delta) }).eq('id', goalId);
    setSavingMovement(false);
    setActiveMovement(null);
    setMovementForm({ amount: '', type: 'deposit' });
    if (householdId && currentUserId) await loadGoals(householdId, currentUserId);
  }

  async function deleteGoal(goalId: string, goalName: string) {
    if (!confirm(`Excluir "${goalName}"?`)) return;
    await supabase.from('goal_movements').delete().eq('goal_id', goalId);
    await supabase.from('goals').delete().eq('id', goalId);
    if (householdId && currentUserId) await loadGoals(householdId, currentUserId);
  }

  function daysUntilDeadline(deadline: string) {
    const diff = Math.round((new Date(deadline + 'T12:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
    if (diff < 0) return { label: `${Math.abs(diff)} dias em atraso`, color: '#e74c3c' };
    if (diff === 0) return { label: 'Prazo hoje!', color: '#e67e22' };
    if (diff <= 30) return { label: `${diff} dias restantes`, color: '#e67e22' };
    return { label: `${diff} dias restantes`, color: '#27ae60' };
  }

  if (loading) return <main style={{ padding: 16 }}>Carregando...</main>;

  function GoalCard({ goal }: { goal: Goal }) {
    const isMonthly = (goal as any).kind === 'monthly';
    const progress = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
    const isComplete = !isMonthly && progress >= 100;
    const deadline = goal.deadline ? daysUntilDeadline(goal.deadline) : null;
    const isMoving = activeMovement === goal.id;

    // Para meta mensal: progresso do mês atual
    const monthSaved = currentMonthSaved[goal.id] || 0;
    const monthProgress = isMonthly && goal.target_amount > 0 ? (monthSaved / goal.target_amount) * 100 : 0;
    const monthComplete = isMonthly && monthProgress >= 100;

    return (
      <div style={{
        border: isComplete || monthComplete ? '2px solid #2ecc71' : '1px solid #ddd',
        borderRadius: 12, padding: 18, marginBottom: 14,
        backgroundColor: isComplete || monthComplete ? '#f0fff4' : 'white',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <span style={{ fontWeight: 'bold', fontSize: 16 }}>
              {isMonthly ? '📅 ' : (isComplete ? '🏆 ' : '🎯 ')}{goal.name}
            </span>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {goal.type === 'shared' && (
                <span style={{ fontSize: 11, backgroundColor: '#e3f2fd', color: '#1565c0', padding: '2px 8px', borderRadius: 12 }}>👫 Casal</span>
              )}
              {isMonthly && (
                <span style={{ fontSize: 11, backgroundColor: '#f3e5f5', color: '#7b1fa2', padding: '2px 8px', borderRadius: 12 }}>📅 Meta mensal</span>
              )}
            </div>
          </div>
          <button onClick={() => deleteGoal(goal.id, goal.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 16 }}>🗑️</button>
        </div>

        {/* Meta mensal: mostra progresso do mês */}
        {isMonthly ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div>
                <span style={{ fontSize: 22, fontWeight: 'bold', color: monthComplete ? '#27ae60' : '#333' }}>R$ {monthSaved.toFixed(2)}</span>
                <span style={{ fontSize: 13, color: '#999' }}> / R$ {goal.target_amount.toFixed(2)} este mês</span>
              </div>
            </div>
            <div style={{ width: '100%', height: 10, backgroundColor: '#f0f0f0', borderRadius: 10, marginBottom: 6, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(monthProgress, 100)}%`, height: '100%', backgroundColor: monthComplete ? '#2ecc71' : monthProgress > 66 ? '#f39c12' : '#3498db', borderRadius: 10, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
              {monthProgress.toFixed(0)}% da meta do mês
              {monthSaved < goal.target_amount && (
                <span style={{ color: '#999' }}> · faltam R$ {(goal.target_amount - monthSaved).toFixed(2)}</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
              Total acumulado: <strong>R$ {Number(goal.current_amount).toFixed(2)}</strong>
            </div>
            {monthComplete && (
              <div style={{ textAlign: 'center', color: '#27ae60', fontWeight: 'bold', fontSize: 14, marginBottom: 8 }}>🎉 Meta do mês atingida!</div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 'bold', color: isComplete ? '#27ae60' : '#333' }}>R$ {Number(goal.current_amount).toFixed(2)}</span>
              <span style={{ fontSize: 13, color: '#999' }}>de R$ {Number(goal.target_amount).toFixed(2)}</span>
            </div>
            <div style={{ width: '100%', height: 10, backgroundColor: '#f0f0f0', borderRadius: 10, marginBottom: 6, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(progress, 100)}%`, height: '100%', backgroundColor: isComplete ? '#2ecc71' : progress > 66 ? '#f39c12' : '#3498db', borderRadius: 10, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
              {progress.toFixed(1)}% concluído
              {goal.target_amount > 0 && goal.current_amount < goal.target_amount && (
                <span style={{ color: '#999' }}> · faltam R$ {(goal.target_amount - goal.current_amount).toFixed(2)}</span>
              )}
            </div>
          </>
        )}

        {deadline && !isComplete && (
          <div style={{ fontSize: 12, color: deadline.color, marginBottom: 10 }}>
            📅 {new Date(goal.deadline! + 'T12:00:00').toLocaleDateString('pt-BR')} — {deadline.label}
          </div>
        )}

        {!isComplete && !isMoving && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => { setActiveMovement(goal.id); setMovementForm({ amount: '', type: 'deposit' }); }}
              style={{ flex: 1, padding: '8px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>
              ➕ Depositar
            </button>
            {goal.current_amount > 0 && (
              <button onClick={() => { setActiveMovement(goal.id); setMovementForm({ amount: '', type: 'withdrawal' }); }}
                style={{ flex: 1, padding: '8px', backgroundColor: '#e67e22', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>
                ➖ Resgatar
              </button>
            )}
          </div>
        )}

        {isMoving && (
          <div style={{ marginTop: 12, backgroundColor: '#f8f9fa', borderRadius: 8, padding: 14, border: '1px solid #ddd' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button onClick={() => setMovementForm(f => ({ ...f, type: 'deposit' }))}
                style={{ flex: 1, padding: '8px', border: movementForm.type === 'deposit' ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 6, backgroundColor: movementForm.type === 'deposit' ? '#e3f2fd' : 'white', cursor: 'pointer', fontWeight: movementForm.type === 'deposit' ? 'bold' : 'normal' }}>
                ➕ Depositar
              </button>
              <button onClick={() => setMovementForm(f => ({ ...f, type: 'withdrawal' }))}
                style={{ flex: 1, padding: '8px', border: movementForm.type === 'withdrawal' ? '2px solid #e67e22' : '1px solid #ddd', borderRadius: 6, backgroundColor: movementForm.type === 'withdrawal' ? '#fff3e0' : 'white', cursor: 'pointer', fontWeight: movementForm.type === 'withdrawal' ? 'bold' : 'normal' }}>
                ➖ Resgatar
              </button>
            </div>
            <input type="number" placeholder="0,00" value={movementForm.amount}
              onChange={e => setMovementForm(f => ({ ...f, amount: e.target.value }))}
              min="0.01" step="0.01" autoFocus
              style={{ width: '100%', padding: 10, fontSize: 18, borderRadius: 6, border: '1px solid #ddd', marginBottom: 10, textAlign: 'center' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => saveMovement(goal.id)} disabled={savingMovement}
                style={{ flex: 1, padding: '10px', backgroundColor: savingMovement ? '#95a5a6' : (movementForm.type === 'deposit' ? '#27ae60' : '#e67e22'), color: 'white', border: 'none', borderRadius: 6, cursor: savingMovement ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                {savingMovement ? '⏳' : '✅ Confirmar'}
              </button>
              <button onClick={() => setActiveMovement(null)}
                style={{ padding: '10px 16px', backgroundColor: 'transparent', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', color: '#666' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {isComplete && (
          <div style={{ textAlign: 'center', marginTop: 10, color: '#27ae60', fontWeight: 'bold', fontSize: 14 }}>🏆 Meta alcançada!</div>
        )}
      </div>
    );
  }

  const sharedGoals = goals.filter(g => g.type === 'shared');
  const individualGoals = goals.filter(g => g.type === 'individual');

  return (
    <>
      <Header title="Metas" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
              {goals.length} meta{goals.length !== 1 ? 's' : ''} ativa{goals.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={() => { setShowCreateForm(!showCreateForm); setErrorMsg(null); }}
            style={{ padding: '10px 18px', backgroundColor: showCreateForm ? '#95a5a6' : '#3498db', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>
            {showCreateForm ? '✕ Fechar' : '+ Nova meta'}
          </button>
        </div>

        {/* Formulário de criação */}
        {showCreateForm && (
          <form onSubmit={createGoal} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 20, marginBottom: 24, backgroundColor: '#fafafa' }}>
            <h3 style={{ margin: '0 0 16px' }}>Nova meta</h3>

            {/* Tipo de meta */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 8, fontSize: 14 }}>Tipo de meta:</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button type="button" onClick={() => setNewGoal(g => ({ ...g, kind: 'target' }))}
                  style={{ padding: 12, border: newGoal.kind === 'target' ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 8, backgroundColor: newGoal.kind === 'target' ? '#e3f2fd' : 'white', cursor: 'pointer', fontWeight: newGoal.kind === 'target' ? 'bold' : 'normal' }}>
                  🎯 Valor alvo<br /><span style={{ fontSize: 11, color: '#666' }}>Ex: Viagem, compra</span>
                </button>
                <button type="button" onClick={() => setNewGoal(g => ({ ...g, kind: 'monthly' }))}
                  style={{ padding: 12, border: newGoal.kind === 'monthly' ? '2px solid #9b59b6' : '1px solid #ddd', borderRadius: 8, backgroundColor: newGoal.kind === 'monthly' ? '#f3e5f5' : 'white', cursor: 'pointer', fontWeight: newGoal.kind === 'monthly' ? 'bold' : 'normal' }}>
                  📅 Meta mensal<br /><span style={{ fontSize: 11, color: '#666' }}>Ex: Guardar R$500/mês</span>
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6, fontSize: 14 }}>Nome:</label>
              <input type="text" placeholder={newGoal.kind === 'monthly' ? 'Ex: Guardar para investimento' : 'Ex: Viagem para Europa'}
                value={newGoal.name} onChange={e => setNewGoal(g => ({ ...g, name: e.target.value }))}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 15 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              {newGoal.kind === 'target' ? (
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6, fontSize: 14 }}>Valor alvo (R$):</label>
                  <input type="number" placeholder="5000" value={newGoal.target}
                    onChange={e => setNewGoal(g => ({ ...g, target: e.target.value }))}
                    min="0.01" step="0.01"
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 15 }} />
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6, fontSize: 14 }}>Meta por mês (R$):</label>
                  <input type="number" placeholder="500" value={newGoal.monthlyTarget}
                    onChange={e => setNewGoal(g => ({ ...g, monthlyTarget: e.target.value }))}
                    min="0.01" step="0.01"
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 15 }} />
                  {newGoal.monthlyTarget && (
                    <div style={{ fontSize: 11, color: '#9b59b6', marginTop: 4 }}>
                      Em 12 meses: R$ {(parseFloat(newGoal.monthlyTarget) * 12).toFixed(2)}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6, fontSize: 14 }}>Prazo (opcional):</label>
                <input type="date" value={newGoal.deadline}
                  onChange={e => setNewGoal(g => ({ ...g, deadline: e.target.value }))}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 8, fontSize: 14 }}>Visibilidade:</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button type="button" onClick={() => setNewGoal(g => ({ ...g, type: 'individual' }))}
                  style={{ padding: 12, border: newGoal.type === 'individual' ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 8, backgroundColor: newGoal.type === 'individual' ? '#e3f2fd' : 'white', cursor: 'pointer', fontWeight: newGoal.type === 'individual' ? 'bold' : 'normal' }}>
                  👤 Individual<br /><span style={{ fontSize: 11, color: '#666' }}>Só pra mim</span>
                </button>
                <button type="button" onClick={() => setNewGoal(g => ({ ...g, type: 'shared' }))}
                  style={{ padding: 12, border: newGoal.type === 'shared' ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 8, backgroundColor: newGoal.type === 'shared' ? '#e3f2fd' : 'white', cursor: 'pointer', fontWeight: newGoal.type === 'shared' ? 'bold' : 'normal' }}>
                  👫 Casal<br /><span style={{ fontSize: 11, color: '#666' }}>Compartilhada</span>
                </button>
              </div>
            </div>

            {errorMsg && (
              <div style={{ color: '#e74c3c', backgroundColor: '#fde8e8', border: '1px solid #f5c6cb', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>❌ {errorMsg}</div>
            )}

            <button type="submit" disabled={creating}
              style={{ width: '100%', padding: '12px', backgroundColor: creating ? '#95a5a6' : '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: creating ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 15 }}>
              {creating ? '⏳ Criando...' : '✅ Criar meta'}
            </button>
          </form>
        )}

        {/* Metas mensais em destaque */}
        {(() => {
          const monthly = goals.filter(g => (g as any).kind === 'monthly' || false);
          if (monthly.length === 0) return null;
          return (
            <section style={{ marginBottom: 28 }}>
              <h3 style={{ color: '#7b1fa2', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>📅 Metas mensais</h3>
              {monthly.map(g => <GoalCard key={g.id} goal={g} />)}
            </section>
          );
        })()}

        {sharedGoals.filter(g => !(g as any).kind || (g as any).kind === 'target').length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <h3 style={{ color: '#666', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>👫 Metas do casal</h3>
            {sharedGoals.filter(g => !(g as any).kind || (g as any).kind === 'target').map(g => <GoalCard key={g.id} goal={g} />)}
          </section>
        )}

        {individualGoals.filter(g => !(g as any).kind || (g as any).kind === 'target').length > 0 && (
          <section>
            <h3 style={{ color: '#666', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>👤 Suas metas individuais</h3>
            {individualGoals.filter(g => !(g as any).kind || (g as any).kind === 'target').map(g => <GoalCard key={g.id} goal={g} />)}
          </section>
        )}

        {goals.length === 0 && !showCreateForm && (
          <div style={{ textAlign: 'center', padding: 48, color: '#666', border: '1px dashed #ddd', borderRadius: 12 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
            <h3>Nenhuma meta ainda</h3>
            <p style={{ fontSize: 14 }}>Crie uma meta de valor alvo ou de economia mensal.</p>
          </div>
        )}
      </main>
    </>
  );
}