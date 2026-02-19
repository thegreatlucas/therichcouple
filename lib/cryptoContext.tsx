'use client';
// lib/cryptoContext.tsx
// Armazena a chave do household em memória durante a sessão.
// A chave NUNCA é salva no localStorage, sessionStorage ou banco de dados.

import { createContext, useContext, useState, ReactNode } from 'react';

interface CryptoContextType {
  householdKey: CryptoKey | null;
  setHouseholdKey: (key: CryptoKey) => void;
  clearKey: () => void;
}

const CryptoContext = createContext<CryptoContextType>({
  householdKey: null,
  setHouseholdKey: () => {},
  clearKey: () => {},
});

export function CryptoProvider({ children }: { children: ReactNode }) {
  const [householdKey, setHouseholdKeyState] = useState<CryptoKey | null>(null);

  function setHouseholdKey(key: CryptoKey) {
    setHouseholdKeyState(key);
  }

  function clearKey() {
    setHouseholdKeyState(null);
  }

  return (
    <CryptoContext.Provider value={{ householdKey, setHouseholdKey, clearKey }}>
      {children}
    </CryptoContext.Provider>
  );
}

export const useCrypto = () => useContext(CryptoContext);