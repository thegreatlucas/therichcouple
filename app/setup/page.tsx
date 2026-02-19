'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type View = 'loading' | 'existing' | 'choose' | 'create' | 'join';

export default function SetupPage() {
  const [view, setView] = useState<View>('loading');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [existingHousehold, setExistingHousehold] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const router = useRouter();

  useEffect(() => {
    checkExistingHousehold();
  }, []);

  async function checkExistingHousehold() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUserName(user.user_metadata?.name || '');

    const { data: member } = await supabase
      .from('household_members')
      .select('household_id, role, households(id, name, invite_code)')
      .eq('user_id', user.id)
      .single();

    if (member?.households) {
      setExistingHousehold(member.households);
      setView('existing');
    } else {
      setView('choose');
    }
  }

  async function handleCreateHousehold(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!householdName.trim()) { setErrorMsg('Digite um nome para o casal.'); return; }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg('Faça login primeiro.'); setLoading(false); return; }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data: household, error: householdError } = await supabase
      .from('households')
      .insert({ name: householdName.trim(), invite_code: code })
      .select()
      .single();

    if (householdError) { setErrorMsg('Erro ao criar casal: ' + householdError.message); setLoading(false); return; }

    const { error: memberError } = await supabase
      .from('household_members')
      .insert({ household_id: household.id, user_id: user.id, role: 'admin' });

    if (memberError) { setErrorMsg('Casal criado, mas erro ao vincular: ' + memberError.message); setLoading(false); return; }

    setLoading(false);
    setInviteCode(code);
    setExistingHousehold(household);
    setView('existing');
    setSuccessMsg('Casal criado com sucesso! Compartilhe o código abaixo com seu parceiro(a).');
  }

  async function handleJoinHousehold(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const code = joinCode.trim().toUpperCase();
    if (!code) { setErrorMsg('Digite o código de convite.'); return; }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg('Faça login primeiro.'); setLoading(false); return; }

    // Busca household pelo invite_code
    const { data: household, error } = await supabase
      .from('households')
      .select('*')
      .eq('invite_code', code)
      .single();

    if (error || !household) {
      setErrorMsg('Código inválido ou não encontrado. Verifique e tente novamente.');
      setLoading(false);
      return;
    }

    // Verifica se já é membro
    const { data: existing } = await supabase
      .from('household_members')
      .select('*')
      .eq('household_id', household.id)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      setErrorMsg('Você já faz parte deste casal.');
      setLoading(false);
      return;
    }

    // Verifica quantos membros já tem (máximo 2)
    const { data: members } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', household.id);

    if ((members || []).length >= 2) {
      setErrorMsg('Este casal já tem dois membros.');
      setLoading(false);
      return;
    }

    // Entra no household
    const { error: joinError } = await supabase
      .from('household_members')
      .insert({ household_id: household.id, user_id: user.id, role: 'member' });

    if (joinError) { setErrorMsg('Erro ao entrar no casal: ' + joinError.message); setLoading(false); return; }

    setLoading(false);
    setExistingHousehold(household);
    setView('existing');
    setSuccessMsg(`Você entrou no casal "${household.name}" com sucesso! 🎉`);
  }

  async function handleLeaveHousehold() {
    if (!confirm('Tem certeza que quer sair deste casal? Seus dados não serão apagados.')) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('household_members')
      .delete()
      .eq('household_id', existingHousehold.id)
      .eq('user_id', user.id);

    setExistingHousehold(null);
    setView('choose');
    setSuccessMsg(null);
  }

  async function handleSaveName() {
    if (!userName.trim()) return;
    const { error } = await supabase.auth.updateUser({ data: { name: userName.trim() } });
    if (error) { alert('Erro ao salvar nome: ' + error.message); return; }
    setSuccessMsg('Nome atualizado com sucesso!');
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    alert('Código copiado!');
  }

  // ---------- RENDER ----------

  if (view === 'loading') return <main style={{ padding: 16 }}>Carregando...</main>;

  return (
    <main style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>

      {/* Já tem household */}
      {view === 'existing' && existingHousehold && (
        <>
          <h1>🏠 Seu casal</h1>

          {successMsg && (
            <div style={{ backgroundColor: '#d4edda', border: '1px solid #c3e6cb', borderRadius: 8, padding: 14, marginTop: 16, color: '#155724', fontSize: 14 }}>
              ✅ {successMsg}
            </div>
          )}

          <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 20, marginTop: 20, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>👤 Seu perfil</h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Seu nome"
                style={{ flex: 1, padding: 10, fontSize: 15, borderRadius: 8, border: '1px solid #ddd' }}
              />
              <button
                onClick={handleSaveName}
                style={{ padding: '10px 16px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}
              >
                💾 Salvar
              </button>
            </div>
          </div>

          <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 24, marginTop: 0 }}>
            <h2 style={{ margin: '0 0 4px' }}>{existingHousehold.name}</h2>
            <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>Você já está pareado(a).</p>

            <div>
              <p style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 14 }}>🔑 Código de convite para o(a) parceiro(a):</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  fontSize: 28,
                  fontWeight: 'bold',
                  letterSpacing: 6,
                  backgroundColor: '#f0f4ff',
                  border: '2px dashed #3498db',
                  borderRadius: 10,
                  padding: '12px 20px',
                  fontFamily: 'monospace',
                  flex: 1,
                  textAlign: 'center',
                }}>
                  {existingHousehold.invite_code}
                </div>
                <button
                  onClick={() => copyCode(existingHousehold.invite_code)}
                  style={{ padding: '12px 16px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
                >
                  📋 Copiar
                </button>
              </div>
              <p style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
                Compartilhe este código com seu parceiro(a) para que ele(a) entre no casal.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/dashboard">
              <button style={{ padding: '12px 24px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>
                ▶️ Ir para o Dashboard
              </button>
            </Link>
            <button
              onClick={handleLeaveHousehold}
              style={{ padding: '12px 20px', backgroundColor: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
            >
              Sair deste casal
            </button>
          </div>
        </>
      )}

      {/* Escolha: criar ou entrar */}
      {view === 'choose' && (
        <>
          <h1>👫 Configurar casal</h1>
          <p style={{ color: '#666', marginTop: 8, marginBottom: 28 }}>
            Você ainda não está em nenhum casal. Crie um novo ou entre com o código de convite do seu parceiro(a).
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <button
              onClick={() => { setView('create'); setErrorMsg(null); }}
              style={{
                padding: 24, border: '2px solid #3498db', borderRadius: 12,
                backgroundColor: '#f0f8ff', cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>🏠</div>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Criar casal</div>
              <div style={{ fontSize: 12, color: '#666' }}>Sou o primeiro a entrar</div>
            </button>

            <button
              onClick={() => { setView('join'); setErrorMsg(null); }}
              style={{
                padding: 24, border: '2px solid #2ecc71', borderRadius: 12,
                backgroundColor: '#f0fff4', cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔑</div>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Entrar com código</div>
              <div style={{ fontSize: 12, color: '#666' }}>Tenho um código de convite</div>
            </button>
          </div>
        </>
      )}

      {/* Criar */}
      {view === 'create' && (
        <>
          <button onClick={() => setView('choose')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3498db', marginBottom: 16, padding: 0, fontSize: 14 }}>
            ← Voltar
          </button>
          <h1>🏠 Criar casal</h1>
          <p style={{ color: '#666', marginTop: 8, marginBottom: 24 }}>
            Depois de criar, você receberá um código para compartilhar com seu parceiro(a).
          </p>

          <form onSubmit={handleCreateHousehold}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 8 }}>
              Nome do casal:
            </label>
            <input
              type="text"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              placeholder="Lucas & Ana"
              style={{ width: '100%', padding: 12, fontSize: 16, borderRadius: 8, border: '1px solid #ddd', marginBottom: 8 }}
            />
            <p style={{ fontSize: 12, color: '#999', marginBottom: 20 }}>
              Pode ser qualquer nome que identifique vocês dois.
            </p>

            {errorMsg && (
              <div style={{ color: '#e74c3c', backgroundColor: '#fde8e8', border: '1px solid #f5c6cb', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 14 }}>
                ❌ {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '14px', backgroundColor: loading ? '#95a5a6' : '#3498db', color: 'white', border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 16 }}
            >
              {loading ? 'Criando...' : '✅ Criar casal'}
            </button>
          </form>
        </>
      )}

      {/* Entrar com código */}
      {view === 'join' && (
        <>
          <button onClick={() => setView('choose')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3498db', marginBottom: 16, padding: 0, fontSize: 14 }}>
            ← Voltar
          </button>
          <h1>🔑 Entrar com código</h1>
          <p style={{ color: '#666', marginTop: 8, marginBottom: 24 }}>
            Digite o código de convite que seu parceiro(a) te enviou.
          </p>

          <form onSubmit={handleJoinHousehold}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 8 }}>
              Código de convite:
            </label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="EX: ABC123"
              maxLength={8}
              style={{
                width: '100%', padding: 16, fontSize: 28,
                textAlign: 'center', letterSpacing: 6, fontFamily: 'monospace',
                borderRadius: 8, border: '2px dashed #2ecc71', marginBottom: 8,
                textTransform: 'uppercase',
              }}
            />
            <p style={{ fontSize: 12, color: '#999', marginBottom: 20 }}>
              O código tem 6 caracteres e não diferencia maiúsculas/minúsculas.
            </p>

            {errorMsg && (
              <div style={{ color: '#e74c3c', backgroundColor: '#fde8e8', border: '1px solid #f5c6cb', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 14 }}>
                ❌ {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '14px', backgroundColor: loading ? '#95a5a6' : '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 16 }}
            >
              {loading ? 'Verificando...' : '🚀 Entrar no casal'}
            </button>
          </form>
        </>
      )}
    </main>
  );
}