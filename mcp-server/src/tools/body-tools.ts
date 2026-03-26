import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getUserData } from '../firebase.js';
import { filterByWeeks } from '../utils/formatters.js';

export const bodyTools: Tool[] = [
  {
    name: 'get_body_logs',
    description: '取得體重/體脂/肌肉量紀錄，含趨勢計算（週平均、月平均、變化率）',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID' },
        weeks: { type: 'number', description: '查幾週（預設 12）' },
      },
      required: ['userId'],
    },
  },
];

export async function handleBodyTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const userId = args.userId as string;
  const userData = await getUserData(userId);
  const dietData = userData.dietData as DietData | undefined;

  switch (name) {
    case 'get_body_logs':
      return handleGetBodyLogs(dietData, args);

    default:
      throw new Error(`Unknown body tool: ${name}`);
  }
}

function handleGetBodyLogs(dietData: DietData | undefined, args: Record<string, unknown>): string {
  if (!dietData?.bodyLogs || dietData.bodyLogs.length === 0) {
    return JSON.stringify({ error: '無身體測量紀錄', logs: [] });
  }

  const weeks = (args.weeks as number) ?? 12;
  const logs = filterByWeeks(dietData.bodyLogs, weeks);
  logs.sort((a, b) => a.date.localeCompare(b.date));

  if (logs.length === 0) {
    return JSON.stringify({ weeks, logsFound: 0, logs: [] });
  }

  // Calculate trends
  const weights = logs.map((l) => l.weight);
  const firstWeight = weights[0];
  const lastWeight = weights[weights.length - 1];
  const weightDelta = Math.round((lastWeight - firstWeight) * 10) / 10;
  const weightChangePct = Math.round(((lastWeight - firstWeight) / firstWeight) * 100 * 10) / 10;

  // Weekly averages
  const weekMap = new Map<string, number[]>();
  for (const log of logs) {
    const week = getWeekLabel(log.date);
    if (!weekMap.has(week)) weekMap.set(week, []);
    weekMap.get(week)!.push(log.weight);
  }

  const weeklyAvg = Array.from(weekMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, ws]) => ({
      week,
      avgWeight: Math.round((ws.reduce((s, w) => s + w, 0) / ws.length) * 10) / 10,
    }));

  // Body fat trend (if available)
  const bodyFatLogs = logs.filter((l) => l.bodyFat != null);
  const bodyFatTrend =
    bodyFatLogs.length >= 2
      ? {
          first: bodyFatLogs[0].bodyFat!,
          last: bodyFatLogs[bodyFatLogs.length - 1].bodyFat!,
          delta: Math.round((bodyFatLogs[bodyFatLogs.length - 1].bodyFat! - bodyFatLogs[0].bodyFat!) * 10) / 10,
        }
      : null;

  return JSON.stringify({
    weeks,
    logsFound: logs.length,
    logs: logs.map((l) => ({
      id: l.id,
      date: l.date,
      weight: l.weight,
      bodyFat: l.bodyFat,
      muscleMass: l.muscleMass,
      notes: l.notes,
    })),
    summary: {
      currentWeight: lastWeight,
      startWeight: firstWeight,
      weightDelta,
      weightChangePct,
      direction: weightDelta > 0.5 ? 'gaining' : weightDelta < -0.5 ? 'losing' : 'maintaining',
      weeklyAvg,
      bodyFatTrend,
    },
  });
}

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const week = Math.ceil(
    ((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  );
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

interface DietData {
  bodyLogs: Array<{
    id: string;
    date: string;
    weight: number;
    bodyFat?: number;
    muscleMass?: number;
    notes?: string;
  }>;
  profile?: unknown;
  currentPlan?: unknown;
  planHistory?: unknown[];
  nutritionData?: unknown;
}
