export type FinanceGroupType = 'personal' | 'couple' | 'family';

export type MemberRole = 'admin' | 'editor' | 'viewer';

export interface FinanceGroup {
  id: string;
  name: string;
  shipName?: string | null;
  groupType: FinanceGroupType;
  inviteCode: string;
  closeMode: 'manual' | 'auto';
  closeDay: number | null;
  color?: string | null;
  icon?: string | null;
   hasCrypto?: boolean | null;
  onboardingDone?: boolean | null;
}

export interface FinanceMember {
  userId: string;
  groupId: string;
  role: MemberRole;
  name?: string | null;
}

export type SplitMode = 'individual' | 'equal' | 'percentage';

export interface TransactionShare {
  transactionId: string;
  userId: string;
  shareAmount: number;
  sharePercent?: number;
}

