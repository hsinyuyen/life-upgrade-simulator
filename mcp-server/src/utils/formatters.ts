// Calculate e1RM using Epley formula: weight * (1 + reps/30)
export function calcE1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Format a date string for display
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// Get week string from date: "2024-W12"
export function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const week = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// Filter items by date range (dateStr: YYYY-MM-DD)
export function filterByDays<T extends { date: string }>(items: T[], days: number): T[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return items.filter((item) => item.date >= cutoffStr);
}

// Filter items by weeks
export function filterByWeeks<T extends { date: string }>(items: T[], weeks: number): T[] {
  return filterByDays(items, weeks * 7);
}

// Calculate simple linear trend: positive = growing, negative = declining
export function calcTrend(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const last = values[n - 1];
  const first = values[0];
  return Math.round(((last - first) / first) * 100 * 10) / 10; // % change
}

// Group array by week
export function groupByWeek<T extends { date: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const week = getWeekLabel(item.date);
    if (!map.has(week)) map.set(week, []);
    map.get(week)!.push(item);
  }
  return map;
}
