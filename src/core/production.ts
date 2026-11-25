import type { DailyProduction, FactoryState, ProductionProgress } from './types';

export const PRODUCTION_MILESTONES = [
  { label: 'Первый дрон', metric: 'dronesBuilt', target: 1 },
  { label: 'Первая поставка дрона', metric: 'dronesSold', target: 1 },
  { label: 'Серийный выпуск', metric: 'dronesSold', target: 10 },
] as const;

export const DAILY_ORDERS = [
  { label: 'Продать 5 изделий', metric: 'sales', target: 5, reward: 40 },
  { label: 'Собрать 3 дрона', metric: 'dronesBuilt', target: 3, reward: 80 },
  { label: 'Отгрузить 2 дрона', metric: 'dronesSold', target: 2, reward: 120 },
] as const;

type ProductionMetric = (typeof DAILY_ORDERS)[number]['metric'];

export function initialProduction(): ProductionProgress {
  return { dronesBuilt: 0, dronesSold: 0, daily: null };
}

export function localCalendarDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function dailyProductionFor(progress: Readonly<ProductionProgress>, day: string): DailyProduction {
  if (progress.daily && progress.daily.day >= day) return progress.daily;
  return { day, sales: 0, dronesBuilt: 0, dronesSold: 0 };
}

/** Called after production succeeds, with the calendar day supplied by the caller. */
export function recordDailyActivity(state: FactoryState, day: string | undefined, ...metrics: ProductionMetric[]): void {
  if (!day || (state.production.daily && day < state.production.daily.day)) return;
  const daily = dailyProductionFor(state.production, day);
  for (const metric of metrics) {
    daily[metric] += 1;
    const order = DAILY_ORDERS.find((order) => order.metric === metric);
    if (order && daily[metric] === order.target) state.credits += order.reward;
  }
  state.production.daily = daily;
}
