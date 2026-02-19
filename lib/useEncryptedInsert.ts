// lib/useEncryptedInsert.ts
// Hook centralizado para criptografar campos sensíveis antes de salvar no Supabase.
// Adicione ou remova campos de FIELDS_TO_ENCRYPT conforme necessário.

import { useCrypto } from '@/lib/cryptoContext';
import { encryptField } from '@/lib/crypto';

// Campos que serão automaticamente criptografados (quando presentes no record)
const FIELDS_TO_ENCRYPT = ['description', 'amount', 'name', 'total_amount', 'notes'];

export function useEncryptedInsert() {
  const { householdKey } = useCrypto();

  async function encryptRecord(record: Record<string, any>): Promise<Record<string, any>> {
    if (!householdKey) {
      console.warn('[crypto] householdKey não disponível, salvando sem criptografia.');
      return record;
    }

    const encrypted: Record<string, any> = { ...record };

    for (const field of FIELDS_TO_ENCRYPT) {
      if (record[field] !== undefined && record[field] !== null && record[field] !== '') {
        encrypted[`enc_${field}`] = await encryptField(String(record[field]), householdKey);
        // Mantém o campo original por enquanto para compatibilidade,
        // após migração completa pode remover: delete encrypted[field];
      }
    }

    return encrypted;
  }

  return { encryptRecord };
}