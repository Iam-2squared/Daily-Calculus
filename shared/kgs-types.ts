export type KgsLinkStatus = {
  linked: boolean;
  conversionRate: 10000;
  member: { id: string; name: string } | null;
  balance: number | null;
  totalIncome: number | null;
  calculusIncome: number | null;
  syncPending: boolean;
};
