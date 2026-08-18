import { prisma } from '../db';
import { getSettings } from '../settings';
import { cacheGet, cacheSet } from '../redis';

export type BudgetState = {
  spentThisMonth: number;
  spentToday: number;
  budget: number;
  remaining: number;
  exhausted: boolean;
};

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function dayStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export async function getBudgetState(): Promise<BudgetState> {
  const cached = await cacheGet<BudgetState>('budget:state');
  if (cached) return cached;

  const settings = await getSettings();
  const [month, day] = await Promise.all([
    prisma.aIUsage.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: monthStart() } } }),
    prisma.aIUsage.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: dayStart() } } }),
  ]);

  const spentThisMonth = Number(month._sum.costUsd ?? 0);
  const spentToday = Number(day._sum.costUsd ?? 0);
  const budget = settings.monthlyBudgetUsd;
  const state: BudgetState = {
    spentThisMonth,
    spentToday,
    budget,
    remaining: Math.max(0, budget - spentThisMonth),
    exhausted: budget > 0 && spentThisMonth >= budget,
  };
  await cacheSet('budget:state', state, 30);
  return state;
}
