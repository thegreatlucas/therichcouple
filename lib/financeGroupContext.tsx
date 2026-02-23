'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { FinanceGroup, FinanceGroupType, FinanceMember, MemberRole } from '@/lib/types/finance';

interface FinanceGroupContextValue {
  groups: FinanceGroup[];
  members: FinanceMember[];
  activeGroupId: string | null;
  activeGroup: FinanceGroup | null;
  currentMemberRole: MemberRole | null;
  setActiveGroupId: (groupId: string) => void;
  loading: boolean;
}

const FinanceGroupContext = createContext<FinanceGroupContextValue | undefined>(undefined);

export function FinanceGroupProvider({ children }: { children: React.ReactNode }) {
  const [groups, setGroups] = useState<FinanceGroup[]>([]);
  const [members, setMembers] = useState<FinanceMember[]>([]);
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setGroups([]);
        setMembers([]);
        setActiveGroupIdState(null);
        setLoading(false);
        return;
      }

      const { data: rows } = await supabase
        .from('household_members')
        .select(
          `
          household_id,
          role,
          households (
            id,
            name,
            ship_name,
            group_type,
            invite_code,
            close_mode,
            close_day,
            color,
            icon,
            onboarding_done,
            encrypted_key
          )
        `.trim(),
        )
        .eq('user_id', user.id);

      if (cancelled) return;

      const groupsMapped: FinanceGroup[] = [];
      const membersMapped: FinanceMember[] = [];

      for (const row of rows || []) {
        const hh = (row as any).households;
        if (!hh) continue;
        const groupType: FinanceGroupType = (hh.group_type as FinanceGroupType) || 'couple';
        const hasCrypto = !!hh.encrypted_key;

        groupsMapped.push({
          id: hh.id,
          name: hh.name,
          shipName: hh.ship_name,
          groupType,
          inviteCode: hh.invite_code,
          closeMode: (hh.close_mode as 'manual' | 'auto') || 'manual',
          closeDay: hh.close_day ?? null,
          color: hh.color ?? null,
          icon: hh.icon ?? null,
          hasCrypto,
          onboardingDone: hh.onboarding_done ?? null,
        });
        membersMapped.push({
          userId: user.id,
          groupId: row.household_id,
          role: ((row.role as MemberRole) || 'editor') satisfies MemberRole,
        });
      }

      setGroups(groupsMapped);
      setMembers(membersMapped);

      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('activeFinanceGroupId') : null;
      const initialId = stored && groupsMapped.some((g) => g.id === stored) ? stored : groupsMapped[0]?.id ?? null;
      setActiveGroupIdState(initialId);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeGroup = useMemo(
    () => (activeGroupId ? groups.find((g) => g.id === activeGroupId) ?? null : null),
    [groups, activeGroupId],
  );

  const currentMemberRole: MemberRole | null = useMemo(() => {
    if (!activeGroupId) return null;
    const m = members.find((m) => m.groupId === activeGroupId);
    return m?.role ?? null;
  }, [members, activeGroupId]);

  function setActiveGroupId(groupId: string) {
    setActiveGroupIdState(groupId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('activeFinanceGroupId', groupId);
    }
  }

  const value: FinanceGroupContextValue = {
    groups,
    members,
    activeGroupId,
    activeGroup,
    currentMemberRole,
    setActiveGroupId,
    loading,
  };

  return <FinanceGroupContext.Provider value={value}>{children}</FinanceGroupContext.Provider>;
}

export function useFinanceGroup() {
  const ctx = useContext(FinanceGroupContext);
  if (!ctx) throw new Error('useFinanceGroup must be used within a FinanceGroupProvider');
  return ctx;
}

