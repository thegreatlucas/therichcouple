'use client';
// app/setup-crypto/page.tsx
// Compartilhamento seguro da chave AES do household via QR code ou código manual
// Fluxo: Criador gera → QR exibido → Parceiro escaneia → Chave importada

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Header from '@/app/components/Header';
import { useCrypto } from '@/lib/cryptoContext';
import { exportKey, importKey, encryptField, decryptField, deriveKey } from '@/lib/crypto';

type Mode = 'choose' | 'share' | 'receive' | 'success';

// Gera string aleatória de N chars (maiúsculo + números, sem ambíguos)
function randomCode(n: number) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)))
    .map(b => chars[b % chars.length])
    .join('');
}

export default function SetupCryptoPage() {
  const router = useRouter();
  const { householdKey, setHouseholdKey } = useCrypto();
  const [mode, setMode] = useState<Mode>('choose');
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Share flow
  const [transferCode, setTransferCode] = useState('');
  const [tempPin, setTempPin] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(600);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Receive flow
  const [inputCode, setInputCode] = useState('');
  const [inputPin, setInputPin] = useState('');

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setCurrentUserId(user.id);
      const { data: member } = await supabase
        .from('household_members').select('household_id').eq('user_id', user.id).single();
      if (member) setHouseholdId(member.household_id);
    }
    init();
  }, []);

  // Countdown timer para o código expirar
  useEffect(() => {
    if (mode !== 'share' || !expiresAt) return;
    const interval = setInterval(() => {
      const secs = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000));
      setCountdown(secs);
      if (secs === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [mode, expiresAt]);

  // ── SHARE: Gera código e QR ──────────────────────────────────
  async function generateTransfer() {
    if (!householdKey || !householdId || !currentUserId) {
      setError('Chave do cofre não carregada. Desbloqueie o PIN primeiro.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Exporta a chave do household em base64
      const rawKeyB64 = await exportKey(householdKey);

      // 2. Gera senha temporária aleatória (8 chars) e código de 8 chars
      const pin = randomCode(8);
      const code = randomCode(8);
      setTempPin(pin);
      setTransferCode(code);

      // 3. Deriva chave a partir do PIN temporário e criptografa o payload
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltB64 = btoa(String.fromCharCode(...Array.from(salt)));
      const pinKey = await deriveKey(pin, salt);
      const encryptedPayload = await encryptField(rawKeyB64, pinKey);

      // 4. Salva no Supabase (expira em 10 min)
      const { error: dbErr } = await supabase.from('crypto_key_transfers').insert({
        household_id: householdId,
        created_by: currentUserId,
        encrypted_payload: encryptedPayload,
        temp_salt: saltB64,
        transfer_code: code,
      });

      if (dbErr) { setError('Erro ao gerar código: ' + dbErr.message); setLoading(false); return; }

      // 5. Gera QR code (canvas manual — sem biblioteca externa)
      const qrPayload = JSON.stringify({ code, pin });
      await drawQR(qrPayload);

      const exp = new Date(Date.now() + 10 * 60 * 1000);
      setExpiresAt(exp);
      setMode('share');
    } catch (e: any) {
      setError('Erro ao gerar: ' + e.message);
    }

    setLoading(false);
  }

  // QR Code desenhado manualmente no canvas (implementação básica sem lib)
  // Usa a URL com qr-server.com via img tag — não precisa de lib
  async function drawQR(data: string) {
    // Codifica o payload como data URL via QR server público
    const encoded = encodeURIComponent(data);
    setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?data=${encoded}&size=200x200&margin=10`);
  }

  // ── RECEIVE: Importa a chave ──────────────────────────────────
  async function importTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!inputCode.trim() || !inputPin.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const code = inputCode.trim().toUpperCase();

      // 1. Busca o transfer no Supabase
      const { data: transfer, error: dbErr } = await supabase
        .from('crypto_key_transfers')
        .select('*')
        .eq('transfer_code', code)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (dbErr || !transfer) {
        setError('Código inválido, expirado ou já utilizado.');
        setLoading(false);
        return;
      }

      // 2. Deriva chave a partir do PIN digitado e descriptografa
      const salt = Uint8Array.from(atob(transfer.temp_salt), c => c.charCodeAt(0));
      const pinKey = await deriveKey(inputPin.trim(), salt);

      let rawKeyB64: string;
      try {
        rawKeyB64 = await decryptField(transfer.encrypted_payload, pinKey);
      } catch {
        setError('PIN incorreto. Verifique e tente novamente.');
        setLoading(false);
        return;
      }

      // 3. Importa a chave AES
      const key = await importKey(rawKeyB64);
      setHouseholdKey(key);

      // 4. Marca como usado
      await supabase.from('crypto_key_transfers')
        .update({ used: true })
        .eq('id', transfer.id);

      setMode('success');
    } catch (e: any) {
      setError('Erro ao importar chave: ' + e.message);
    }

    setLoading(false);
  }

  const mins = String(Math.floor(countdown / 60)).padStart(2, '0');
  const secs = String(countdown % 60).padStart(2, '0');

  // ──────────────────────────────────────────────────────────────
  // CHOOSE VIEW
  // ──────────────────────────────────────────────────────────────
  if (mode === 'choose') return (
    <>
      <Header title="🔐 Compartilhar chave" backHref="/setup" />
      <main style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ color: 'var(--text)', marginBottom: 6 }}>Compartilhar chave do cofre</h2>
          <p style={{ fontSize: 14, color: 'var(--text3)', lineHeight: 1.6 }}>
            Para que vocês dois possam ver os dados criptografados, o parceiro(a) precisa receber a chave AES do household de forma segura.
          </p>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fde8e8', border: '1px solid #f5c6cb', borderRadius: 10, padding: '12px 14px', marginBottom: 16, color: '#7b1a1a', fontSize: 14 }}>
            ❌ {error}
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {/* Card: Quero compartilhar */}
          <button
            onClick={generateTransfer}
            disabled={loading || !householdKey}
            style={{
              padding: 20, border: '2px solid #3498db', borderRadius: 14,
              backgroundColor: 'var(--surface)', cursor: loading ? 'wait' : 'pointer',
              textAlign: 'left', opacity: !householdKey ? 0.6 : 1,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📤</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>
              {loading ? 'Gerando código...' : 'Quero compartilhar minha chave'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>
              Gera um QR code + código de 1 uso que expira em 10 minutos. Use no celular do seu parceiro(a).
            </div>
            {!householdKey && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#e67e22', fontWeight: 600 }}>
                ⚠️ Desbloqueie o PIN do cofre no dashboard primeiro
              </div>
            )}
          </button>

          {/* Card: Quero receber */}
          <button
            onClick={() => { setMode('receive'); setError(null); }}
            style={{
              padding: 20, border: '2px solid #2ecc71', borderRadius: 14,
              backgroundColor: 'var(--surface)', cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📥</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>
              Quero receber a chave
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>
              Meu parceiro(a) gerou um código. Digito aqui para importar a chave para este dispositivo.
            </div>
          </button>
        </div>
      </main>
    </>
  );

  // ──────────────────────────────────────────────────────────────
  // SHARE VIEW — exibe QR + código manual
  // ──────────────────────────────────────────────────────────────
  if (mode === 'share') return (
    <>
      <Header title="📤 Compartilhar chave" backHref="/setup" />
      <main style={{ padding: 16, maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>

        {/* Countdown */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 16px', borderRadius: 20,
          backgroundColor: countdown > 120 ? '#f0fff5' : '#fff3cd',
          border: `1px solid ${countdown > 120 ? '#b7e4a0' : '#ffc107'}`,
          marginBottom: 20, fontSize: 14, fontWeight: 600,
          color: countdown > 120 ? '#1a5e34' : '#856404',
        }}>
          ⏱️ Expira em {mins}:{secs}
        </div>

        {/* QR Code */}
        {qrDataUrl && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>
              Peça para o parceiro(a) escanear com a câmera do celular:
            </p>
            <div style={{ display: 'inline-block', padding: 12, backgroundColor: 'white', borderRadius: 12, border: '2px solid var(--border)', boxShadow: 'var(--shadow)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR Code" width={200} height={200} style={{ display: 'block' }} />
            </div>
          </div>
        )}

        {/* Separador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ou digitar manualmente</span>
          <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
        </div>

        {/* Código manual */}
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
            Passe estes dois campos para o parceiro(a):
          </p>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Código de transferência</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 6, fontFamily: 'monospace', color: 'var(--text)', padding: '10px 16px', backgroundColor: 'var(--surface2)', borderRadius: 8, border: '2px dashed #3498db' }}>
              {transferCode}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>PIN temporário</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 6, fontFamily: 'monospace', color: '#e74c3c', padding: '10px 16px', backgroundColor: '#fff5f5', borderRadius: 8, border: '2px dashed #e74c3c' }}>
              {tempPin}
            </div>
          </div>
        </div>

        {/* Botões de cópia */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => { navigator.clipboard.writeText(transferCode); }}
            style={{ padding: '10px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            📋 Copiar código
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(`Código: ${transferCode}\nPIN: ${tempPin}`); }}
            style={{ padding: '10px', backgroundColor: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            📤 Copiar tudo
          </button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, padding: '10px 14px', backgroundColor: 'var(--surface2)', borderRadius: 8 }}>
          🔒 Esta chave nunca transita pelo servidor. O Supabase armazena apenas o payload criptografado. Só quem tem o código + PIN consegue descriptografar.
        </div>

        {countdown === 0 && (
          <div style={{ marginTop: 16, padding: 12, backgroundColor: '#fde8e8', borderRadius: 10, color: '#7b1a1a', fontSize: 14 }}>
            ⏰ Código expirado. <button onClick={() => { setMode('choose'); setQrDataUrl(null); }} style={{ background: 'none', border: 'none', color: '#3498db', cursor: 'pointer', fontWeight: 600 }}>Gerar novo</button>
          </div>
        )}
      </main>
    </>
  );

  // ──────────────────────────────────────────────────────────────
  // RECEIVE VIEW — parceiro digita código + PIN
  // ──────────────────────────────────────────────────────────────
  if (mode === 'receive') return (
    <>
      <Header title="📥 Receber chave" backHref="/setup" />
      <main style={{ padding: 16, maxWidth: 420, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ color: 'var(--text)', marginBottom: 6 }}>Receber chave do cofre</h2>
          <p style={{ fontSize: 14, color: 'var(--text3)' }}>
            Digite o código e o PIN que seu parceiro(a) gerou.
          </p>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fde8e8', border: '1px solid #f5c6cb', borderRadius: 10, padding: '12px 14px', marginBottom: 16, color: '#7b1a1a', fontSize: 14 }}>
            ❌ {error}
          </div>
        )}

        <form onSubmit={importTransfer}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>
              Código de transferência
            </label>
            <input
              type="text"
              value={inputCode}
              onChange={e => setInputCode(e.target.value.toUpperCase())}
              placeholder="ABCD1234"
              maxLength={8}
              required
              style={{ width: '100%', padding: '12px 14px', fontSize: 24, textAlign: 'center', letterSpacing: 6, fontFamily: 'monospace', borderRadius: 10, border: '2px dashed #3498db' }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>
              PIN temporário
            </label>
            <input
              type="text"
              value={inputPin}
              onChange={e => setInputPin(e.target.value.toUpperCase())}
              placeholder="WXYZ5678"
              maxLength={8}
              required
              style={{ width: '100%', padding: '12px 14px', fontSize: 24, textAlign: 'center', letterSpacing: 6, fontFamily: 'monospace', borderRadius: 10, border: '2px dashed #e74c3c', color: '#e74c3c' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '14px', backgroundColor: loading ? 'var(--border)' : '#2ecc71', color: 'white', border: 'none', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 16 }}>
            {loading ? '⏳ Importando...' : '🔓 Importar chave'}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
          O código expira 10 minutos após ser gerado e só pode ser usado uma vez.
        </div>
      </main>
    </>
  );

  // ──────────────────────────────────────────────────────────────
  // SUCCESS VIEW
  // ──────────────────────────────────────────────────────────────
  return (
    <>
      <Header title="✅ Chave importada" backHref="/dashboard" />
      <main style={{ padding: 32, maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>🎉</div>
        <h2 style={{ color: 'var(--text)', marginBottom: 8 }}>Chave importada!</h2>
        <p style={{ fontSize: 15, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 28 }}>
          A chave do cofre foi importada com sucesso. Agora você consegue ver todos os dados criptografados do casal.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          style={{ padding: '14px 32px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 16 }}>
          🏠 Ir para o Dashboard
        </button>
        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          A chave ficará ativa nesta sessão. Na próxima vez que abrir o app, use o PIN do cofre normalmente.
        </div>
      </main>
    </>
  );
}