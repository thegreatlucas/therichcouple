// lib/format.ts
// Utilitários de formatação para o padrão brasileiro

/**
 * Formata um número como moeda brasileira
 * Ex: 1234.56 → "R$ 1.234,56"
 */
export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  
  /**
   * Formata número com separador de milhar brasileiro
   * Ex: 1234.56 → "1.234,56"
   */
  export function formatNumber(value: number, decimals = 2): string {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }
  
  /**
   * Converte string no formato brasileiro para número
   * Ex: "1.234,56" → 1234.56
   */
  export function parseBRLNumber(value: string): number {
    return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
  }