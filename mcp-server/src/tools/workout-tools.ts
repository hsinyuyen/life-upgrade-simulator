import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getUserData } from '../firebase.js';
import { calcE1RM, filterByWeeks, filterByDays, groupByWeek, calcTrend } from '../utils/formatters.js';

const DEFAULT_USER_ID = 'JDtFR7FZmGNpmCTkhugfNftpNQl2';

export const workoutTools: Tool[] = [
  {
    name: 'get_recent_workouts',
    description: '取得最近 N 次訓練紀錄，含完整 sets 資料',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID（可選，預設 Edward）' },
        count: { type: 'number', description: '取幾筆（預設 10）' },
        bodyPart: { type: 'string', description: '篩選部位（可選）: chest|back|shoulder|arm|leg|core|cardio' },
        dateFrom: { type: 'string', description: '起始日期 YYYY-MM-DD（可選）' },
      },
      required: [],
    },
  },
  {
    name: 'get_exercise_history',
    description: '取得特定動作的歷史紀錄：日期、組數、重量、次數、RPE、e1RM',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID（可選，預設 Edward）' },
        exerciseName: { type: 'string', description: '動作名稱（例如 Bench Press）' },
        weeks: { type: 'number', description: '查幾週內（預設 8）' },
      },
      required: ['exerciseName'],
    },
  },
  {
    name: 'get_exercise_prs',
    description: '取得所有動作的 PR 紀錄（最佳 e1RM）',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID（可選，預設 Edward）' },
      },
      required: [],
    },
  },
  {
    name: 'get_e1rm_trends',
    description: '取得指定動作的 e1RM 趨勢（每週），含進步率計算',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID（可選，預設 Edward）' },
        exerciseNames: {
          type: 'array',
          items: { type: 'string' },
          description: '動作名稱列表（不填則取 top 5 PR 動作）',
        },
        weeks: { type: 'number', description: '查幾週（預設 12）' },
      },
      required: [],
    },
  },
];

export async function handleWorkoutTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const userId = (args.userId as string) || DEFAULT_USER_ID;
  const userData = await getUserData(userId);
  const workoutData = userData.workoutData as WorkoutData | undefined;

  if (!workoutData) {
    return JSON.stringify({ error: '無訓練資料', userId });
  }

  switch (name) {
    case 'get_recent_workouts':
      return handleGetRecentWorkouts(workoutData, args);

    case 'get_exercise_history':
      return handleGetExerciseHistory(workoutData, args);

    case 'get_exercise_prs':
      return handleGetExercisePRs(workoutData);

    case 'get_e1rm_trends':
      return handleGetE1RMTrends(workoutData, args);

    default:
      throw new Error(`Unknown workout tool: ${name}`);
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

function handleGetRecentWorkouts(workoutData: WorkoutData, args: Record<string, unknown>): string {
  const count = (args.count as number) ?? 10;
  const bodyPart = args.bodyPart as string | undefined;
  const dateFrom = args.dateFrom as string | undefined;

  let sessions = [...(workoutData.sessions ?? [])];

  // Sort descending by date
  sessions.sort((a, b) => b.timestamp - a.timestamp);

  if (dateFrom) {
    sessions = sessions.filter((s) => s.date >= dateFrom);
  }
  if (bodyPart) {
    sessions = sessions.filter((s) => s.bodyParts?.includes(bodyPart as BodyPart));
  }

  sessions = sessions.slice(0, count);

  return JSON.stringify({
    total: sessions.length,
    sessions: sessions.map((s) => ({
      id: s.id,
      date: s.date,
      bodyParts: s.bodyParts,
      totalSets: s.totalSets,
      totalXP: s.totalXP,
      duration: s.duration,
      notes: s.notes,
      exercises: s.exercises.map((e) => ({
        name: e.name,
        sets: e.sets.map((set) => ({
          weight: set.weight,
          reps: set.reps,
          rpe: set.rpe,
          e1rm: calcE1RM(set.weight, set.reps),
        })),
        totalVolume: e.totalVolume,
        isPR: e.isPR,
      })),
    })),
  });
}

function handleGetExerciseHistory(workoutData: WorkoutData, args: Record<string, unknown>): string {
  const exerciseName = args.exerciseName as string;
  const weeks = (args.weeks as number) ?? 8;

  const sessions = [...(workoutData.sessions ?? [])];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - weeks * 7);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  const history: Array<{
    date: string;
    sets: Array<{ weight: number; reps: number; rpe?: number; e1rm: number }>;
    bestE1RM: number;
    totalVolume: number;
  }> = [];

  for (const session of sessions) {
    if (session.date < cutoffStr) continue;
    const exercise = session.exercises.find(
      (e) => e.name.toLowerCase() === exerciseName.toLowerCase()
    );
    if (!exercise) continue;

    const sets = exercise.sets.map((set) => ({
      weight: set.weight,
      reps: set.reps,
      rpe: set.rpe,
      e1rm: calcE1RM(set.weight, set.reps),
    }));

    history.push({
      date: session.date,
      sets,
      bestE1RM: Math.max(...sets.map((s) => s.e1rm)),
      totalVolume: exercise.totalVolume,
    });
  }

  history.sort((a, b) => a.date.localeCompare(b.date));

  // Also include e1RM history from exerciseE1RMs if available
  const e1rmHistory = workoutData.exerciseE1RMs?.[exerciseName] ?? [];

  return JSON.stringify({
    exerciseName,
    weeks,
    sessionsFound: history.length,
    history,
    e1rmHistory: e1rmHistory
      .filter((e) => e.date >= cutoffStr)
      .sort((a, b) => a.date.localeCompare(b.date)),
  });
}

function handleGetExercisePRs(workoutData: WorkoutData): string {
  const prs = workoutData.exercisePRs ?? {};

  // Enrich with last session date where PR was achieved
  const prList = Object.entries(prs).map(([exercise, bestE1RM]) => {
    // Find the most recent session that has this exercise
    const sessions = (workoutData.sessions ?? []).filter((s) =>
      s.exercises.some((e) => e.name.toLowerCase() === exercise.toLowerCase())
    );
    sessions.sort((a, b) => b.timestamp - a.timestamp);
    const lastSession = sessions[0];

    return {
      exercise,
      bestE1RM,
      lastTrainedDate: lastSession?.date ?? null,
    };
  });

  // Sort by bestE1RM descending
  prList.sort((a, b) => b.bestE1RM - a.bestE1RM);

  return JSON.stringify({
    total: prList.length,
    prs: prList,
  });
}

function handleGetE1RMTrends(workoutData: WorkoutData, args: Record<string, unknown>): string {
  const weeks = (args.weeks as number) ?? 12;
  let exerciseNames = args.exerciseNames as string[] | undefined;

  // If not specified, pick top 5 by PR
  if (!exerciseNames || exerciseNames.length === 0) {
    const prs = workoutData.exercisePRs ?? {};
    exerciseNames = Object.entries(prs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - weeks * 7);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  const trends = exerciseNames.map((exerciseName) => {
    // Use exerciseE1RMs if available
    const e1rmData = (workoutData.exerciseE1RMs?.[exerciseName] ?? [])
      .filter((e) => e.date >= cutoffStr)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Fallback: calculate from sessions
    if (e1rmData.length === 0) {
      const sessions = (workoutData.sessions ?? []).filter(
        (s) =>
          s.date >= cutoffStr &&
          s.exercises.some((e) => e.name.toLowerCase() === exerciseName.toLowerCase())
      );

      for (const session of sessions) {
        const exercise = session.exercises.find(
          (e) => e.name.toLowerCase() === exerciseName.toLowerCase()
        );
        if (!exercise) continue;
        const bestE1RM = Math.max(...exercise.sets.map((s) => calcE1RM(s.weight, s.reps)));
        e1rmData.push({ date: session.date, e1rm: bestE1RM });
      }
      e1rmData.sort((a, b) => a.date.localeCompare(b.date));
    }

    // Group by week for cleaner view
    const weeklyBest = new Map<string, number>();
    for (const entry of e1rmData) {
      const week = getWeekLabel(entry.date);
      const current = weeklyBest.get(week) ?? 0;
      if (entry.e1rm > current) weeklyBest.set(week, entry.e1rm);
    }

    const weeklyData = Array.from(weeklyBest.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, e1rm]) => ({ week, e1rm }));

    const values = weeklyData.map((d) => d.e1rm);
    const progressPct = values.length >= 2 ? calcTrend(values) : null;

    return {
      exercise: exerciseName,
      currentPR: workoutData.exercisePRs?.[exerciseName] ?? null,
      progressPct,
      trend: progressPct === null ? 'insufficient data' : progressPct > 1 ? 'progressing' : progressPct < -1 ? 'declining' : 'plateau',
      weeklyData,
    };
  });

  return JSON.stringify({ weeks, trends });
}

// ─── Type helpers (local, not imported from app) ──────────────────────────────

type BodyPart = 'chest' | 'back' | 'shoulder' | 'arm' | 'leg' | 'core' | 'cardio';

interface WorkoutData {
  sessions: Array<{
    id: string;
    date: string;
    timestamp: number;
    bodyParts: BodyPart[];
    exercises: Array<{
      id: string;
      name: string;
      sets: Array<{ weight: number; reps: number; rpe?: number }>;
      totalVolume: number;
      xpEarned: number;
      isPR: boolean;
    }>;
    totalSets: number;
    totalXP: number;
    duration?: number;
    notes?: string;
  }>;
  exercisePRs: Record<string, number>;
  exerciseE1RMs?: Record<string, Array<{ date: string; e1rm: number }>>;
  trainingProgram?: unknown;
  cardioSessions?: unknown[];
  recoveryScores?: unknown[];
  weeklyReports?: unknown[];
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
