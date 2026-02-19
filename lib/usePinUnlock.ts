// lib/usePinUnlock.ts
// Hook reutilizável para desbloquear a chave do household com o PIN do usuário.
// Busca encrypted_key e key_salt do Supabase e seta a chave no CryptoContext.

import { useCrypto } from './cryptoContext';
import { decryptHouseholdKey } from './crypto';
import { supabase } from './supabaseClient';

export function usePinUnlock() {
  const { setHouseholdKey } = useCrypto();

  async function unlockWithPin(householdId: string, pin: string): Promise<boolean> {
    const { data } = await supabase
      .from('households')
      .select('encrypted_key, key_salt')
      .eq('id', householdId)
      .single();

    // Household sem criptografia ainda (criado antes da feature) — libera sem PIN
    if (!data?.encrypted_key) return true;

    try {
      const key = await decryptHouseholdKey(data.encrypted_key, data.key_salt, pin);
      setHouseholdKey(key);
      return true;
    } catch {
      return false; // PIN incorreto
    }
  }

  return { unlockWithPin };
}