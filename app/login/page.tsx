'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const router = useRouter();

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) { setErrorMsg(error.message); return; }
    setSuccessMsg('Cadastro realizado! Verifique seu e-mail para confirmar a conta, depois faça login.');
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) { setErrorMsg('E-mail ou senha incorretos.'); return; }

    // Após login, deixa o contexto de Workspaces decidir se vai para dashboard ou setup
    router.push('/dashboard');
  }

  return (
    <main style={{ padding: 16, maxWidth: 400, margin: '0 auto', paddingTop: 48 }}>
      <h1 style={{ marginBottom: 4 }}>💰 Espaços Financeiros</h1>
      <p style={{ color: '#666', marginBottom: 32, fontSize: 14 }}>
        Organize suas finanças em workspaces para uso individual, casal ou família.
      </p>

      {/* Toggle */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #ddd', borderRadius: 8, marginBottom: 24, overflow: 'hidden' }}>
        <button
          onClick={() => { setMode('signin'); setErrorMsg(null); setSuccessMsg(null); }}
          style={{ padding: '12px', border: 'none', cursor: 'pointer', fontWeight: mode === 'signin' ? 'bold' : 'normal', backgroundColor: mode === 'signin' ? '#3498db' : 'white', color: mode === 'signin' ? 'white' : '#333' }}
        >
          Entrar
        </button>
        <button
          onClick={() => { setMode('signup'); setErrorMsg(null); setSuccessMsg(null); }}
          style={{ padding: '12px', border: 'none', cursor: 'pointer', fontWeight: mode === 'signup' ? 'bold' : 'normal', backgroundColor: mode === 'signup' ? '#3498db' : 'white', color: mode === 'signup' ? 'white' : '#333' }}
        >
          Cadastrar
        </button>
      </div>

      <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>E-mail:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            required
            style={{ width: '100%', padding: 12, fontSize: 15, borderRadius: 8, border: '1px solid #ddd' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Senha:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            required
            minLength={6}
            style={{ width: '100%', padding: 12, fontSize: 15, borderRadius: 8, border: '1px solid #ddd' }}
          />
        </div>

        {errorMsg && (
          <div style={{ color: '#e74c3c', backgroundColor: '#fde8e8', border: '1px solid #f5c6cb', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 14 }}>
            ❌ {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{ color: '#155724', backgroundColor: '#d4edda', border: '1px solid #c3e6cb', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 14 }}>
            ✅ {successMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '14px', backgroundColor: loading ? '#95a5a6' : '#3498db', color: 'white', border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 16 }}
        >
          {loading ? 'Aguarde...' : mode === 'signin' ? '🔐 Entrar' : '✅ Criar conta'}
        </button>
      </form>
    </main>
  );
}
