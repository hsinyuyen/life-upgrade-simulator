import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getUserData } from '../firebase.js';
import { calcE1RM, filterByDays, filterByWeeks } from '../utils/formatters.js';

export const analysisTools: Tool[] = [
  {
    name: 'get_cardio_sessions',
    description: '取得有氧訓練紀錄，含每週總時間統計',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID' },
        weeks: { type: 'number', description: '查幾週（預設 4）' },
        type: {
          type: 'string',
          description: '篩選類型（可選）: LISS|HIIT|Conditioning|Sport',
        },
      },
      required: ['userId'],
    },
  },
  {
    name: 'get_recovery_scores',
    description: '取得恢復評分歷史，含趨勢和平均值',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID' },
        days: { type: 'number', description: '查幾天（預設 14）' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'analyze_overall_status',
    description:
      '取得用戶完整狀態概覽（給教練快速了解全局用）：計劃進度、readiness、本週訓練量、飲食合規度、體重趨勢、警訊',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID' },
      },
      required: ['userId'],
    },
  },
];

export async function handleAnalysisTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const userId = args.userId as string;
  const userData = await getUserData(userId);

  switch (name) {
    case 'get_cardio_sessions':
      return handleGetCardioSessions(userData.workoutData as WorkoutData | undefined, args);

    case 'get_recovery_scores':
      return handleGetRecoveryScores(userData.workoutData as WorkoutData | undefined, args);

    case 'analyze_overall_status':
      return handleAnalyzeOverallStatus(userData);

    default:
      throw new Error(`Unknown analysis tool: ${name}`);
  }
}

function handleGetCardioSessions(
  workoutData: WorkoutData | undefined,
  args: Record<string, unknown>
): string {
  const sessions = workoutData?.cardioSessions ?? [];
  const weeks = (args.weeks as number) ?? 4;
  const typeFilter = args.type as string | undefined;

  let filtered = filterByWeeks(sessions, weeks);
  if (typeFilter) {
    filtered = filtered.filter((s) => s.type === typeFilter);
  }
  filtered.sort((a, b) => b.date.localeCompare(a.date));

  // Weekly stats
  const weekMap = new Map<string, { minutes: number; sessions: number; calories: number }>();
  for (const session of filtered) {
    const week = getWeekLabel(session.date);
    if (!weekMap.has(week)) weekMap.set(week, { minutes: 0, sessions: 0, calories: 0 });
    const w = weekMap.get(week)!;
    w.minutes += session.durationMinutes;
    w.sessions += 1;
    w.calories += session.caloriesBurned ?? 0;
  }

  const weeklyStats = Array.from(weekMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, stats]) => ({ week, ...stats }));

  return JSON.stringify({
    weeks,
    sessionsFound: filtered.length,
    totalMinutes: filtered.reduce((s, c) => s + c.durationMinutes, 0),
    weeklyStats,
    sessions: filtered.map((s) => ({
      id: s.id,
      date: s.date,
      type: s.type,
      activity: s.activity,
      durationMinutes: s.durationMinutes,
      caloriesBurned: s.caloriesBurned,
      avgHeartRate: s.avgHeartRate,
      distanceKm: s.distanceKm,
      rpe: s.rpe,
      notes: s.notes,
    })),
  });
}

function handleGetRecoveryScores(
  workoutData: WorkoutData | undefined,
  args: Record<string, unknown>
): string {
  const scores = workoutData?.recoveryScores ?? [];
  const days = (args.days as number) ?? 14;

  const filtered = filterByDays(scores, days);
  filtered.sort((a, b) => b.date.localeCompare(a.date));

  if (filtered.length === 0) {
    return JSON.stringify({ days, scoresFound: 0, scores: [], averages: null });
  }

  const avg = (arr: number[]) => Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;

  const averages = {
    sleepHours: avg(filtered.map((s) => s.sleepHours)),
    sleepQuality: avg(filtered.map((s) => s.sleepQuality)),
    muscleSoreness: avg(filtered.map((s) => s.muscleSoreness)),
    energyLevel: avg(filtered.map((s) => s.energyLevel)),
    stressLevel: avg(filtered.map((s) => s.stressLevel)),
    overallReadiness: avg(filtered.map((s) => s.overallReadiness)),
  };

  // Trend: last 3 vs previous 3
  let readinessTrend = 'insufficient data';
  if (filtered.length >= 6) {
    const recent3 = avg(filtered.slice(0, 3).map((s) => s.overallReadiness));
    const prev3 = avg(filtered.slice(3, 6).map((s) => s.overallReadiness));
    readinessTrend = recent3 > prev3 + 0.5 ? 'improving' : recent3 < prev3 - 0.5 ? 'declining' : 'stable';
  }

  return JSON.stringify({
    days,
    scoresFound: filtered.length,
    averages,
    readinessTrend,
    scores: filtered.map((s) => ({
      id: s.id,
      date: s.date,
      sleepHours: s.sleepHours,
      sleepQuality: s.sleepQuality,
      muscleSoreness: s.muscleSoreness,
      energyLevel: s.energyLevel,
      stressLevel: s.stressLevel,
      overallReadiness: s.overallReadiness,
      notes: s.notes,
    })),
  });
}

function handleAnalyzeOverallStatus(userData: FirebaseUserData): string {
  const workoutData = userData.workoutData as WorkoutData | undefined;
  const dietData = userData.dietData as DietData | undefined;

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  // ── Training program status ──
  const program = workoutData?.trainingProgram;
  let programStatus = null;
  if (program) {
    const totalDays = program.weeks.reduce((acc: number, w: ProgramWeek) => acc + w.days.length, 0);
    const completedDays = program.weeks.reduce(
      (acc: number, w: ProgramWeek) => acc + w.days.filter((d: ProgramDay) => d.completed).length,
      0
    );
    const currentWeekData = program.weeks.find((w: ProgramWeek) => w.weekNumber === program.currentWeek);
    const thisWeekCompleted = currentWeekData?.days.filter((d: ProgramDay) => d.completed).length ?? 0;

    programStatus = {
      name: program.name,
      phase: program.phase,
      splitType: program.splitType,
      currentWeek: program.currentWeek,
      totalWeeks: program.totalWeeks,
      progressPct: Math.round((completedDays / totalDays) * 100),
      thisWeekCompleted,
      thisWeekTotal: currentWeekData?.days.length ?? 0,
      isDeloadWeek: currentWeekData?.isDeload ?? false,
    };
  }

  // ── Recent workouts this week ──
  const thisWeekSessions = (workoutData?.sessions ?? []).filter((s: WorkoutSession) => s.date >= weekAgo);
  thisWeekSessions.sort((a: WorkoutSession, b: WorkoutSession) => b.timestamp - a.timestamp);
  const thisWeekSets = thisWeekSessions.reduce((s: number, sess: WorkoutSession) => s + sess.totalSets, 0);
  const newPRs = thisWeekSessions.reduce(
    (count: number, sess: WorkoutSession) => count + sess.exercises.filter((e: Exercise) => e.isPR).length,
    0
  );

  // ── Recovery ──
  const recentRecovery = (workoutData?.recoveryScores ?? [])
    .filter((s: RecoveryScore) => s.date >= weekAgo)
    .sort((a: RecoveryScore, b: RecoveryScore) => b.date.localeCompare(a.date));
  const latestReadiness = recentRecovery[0]?.overallReadiness ?? null;
  const avgReadiness =
    recentRecovery.length > 0
      ? Math.round(
          (recentRecovery.reduce((s: number, r: RecoveryScore) => s + r.overallReadiness, 0) / recentRecovery.length) * 10
        ) / 10
      : null;

  // ── Diet compliance this week ──
  const weekNutritionLogs = (dietData?.nutritionData?.dailyLogs ?? []).filter(
    (l: NutritionLog) => l.date >= weekAgo
  );
  const dietCompliance =
    weekNutritionLogs.length > 0
      ? Math.round((weekNutritionLogs.filter((l: NutritionLog) => l.macroHit).length / weekNutritionLogs.length) * 100)
      : null;
  const avgCalories =
    weekNutritionLogs.length > 0
      ? Math.round(weekNutritionLogs.reduce((s: number, l: NutritionLog) => s + l.totalCalories, 0) / weekNutritionLogs.length)
      : null;

  // ── Body weight trend ──
  const recentBodyLogs = (dietData?.bodyLogs ?? [])
    .filter((l: BodyLog) => l.date >= weekAgo)
    .sort((a: BodyLog, b: BodyLog) => b.date.localeCompare(a.date));
  const currentWeight = recentBodyLogs[0]?.weight ?? null;

  const olderBodyLogs = (dietData?.bodyLogs ?? [])
    .filter((l: BodyLog) => {
      const fourWeeksAgo = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
      return l.date >= fourWeeksAgo && l.date < weekAgo;
    })
    .sort((a: BodyLog, b: BodyLog) => a.date.localeCompare(b.date));
  const prevWeight = olderBodyLogs[0]?.weight ?? null;

  let weightTrend = 'unknown';
  if (currentWeight && prevWeight) {
    const delta = currentWeight - prevWeight;
    weightTrend =
      delta > 0.5
        ? `gaining (+${delta.toFixed(1)}kg in ~4 weeks)`
        : delta < -0.5
        ? `losing (${delta.toFixed(1)}kg in ~4 weeks)`
        : 'maintaining';
  }

  // ── Warnings ──
  const warnings: string[] = [];

  if (latestReadiness !== null && latestReadiness < 5) {
    warnings.push(`⚠️ 恢復狀態偏低（readiness ${latestReadiness}/10）`);
  }
  if (avgReadiness !== null && avgReadiness < 6) {
    warnings.push(`⚠️ 本週平均恢復評分偏低（${avgReadiness}/10），考慮 deload`);
  }
  if (dietCompliance !== null && dietCompliance < 60) {
    warnings.push(`⚠️ 飲食合規度偏低（${dietCompliance}%）`);
  }
  if (programStatus && thisWeekSessions.length < 2 && today >= weekAgo) {
    warnings.push(`⚠️ 本週訓練次數偏少（${thisWeekSessions.length} 次）`);
  }

  return JSON.stringify({
    asOf: today,
    programStatus,
    thisWeek: {
      sessions: thisWeekSessions.length,
      totalSets: thisWeekSets,
      newPRs,
      sessionDates: thisWeekSessions.map((s: WorkoutSession) => s.date),
    },
    recovery: {
      latestReadiness,
      avgReadiness,
      latestDate: recentRecovery[0]?.date ?? null,
    },
    diet: {
      compliancePct: dietCompliance,
      avgCalories,
      targetCalories: dietData?.profile?.targetCalories ?? null,
      logsThisWeek: weekNutritionLogs.length,
    },
    body: {
      currentWeight,
      weightTrend,
      latestDate: recentBodyLogs[0]?.date ?? null,
    },
    warnings,
  });
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

interface WorkoutSession {
  id: string;
  date: string;
  timestamp: number;
  bodyParts: string[];
  exercises: Exercise[];
  totalSets: number;
  totalXP: number;
  duration?: number;
  notes?: string;
}

interface Exercise {
  id: string;
  name: string;
  sets: Array<{ weight: number; reps: number; rpe?: number }>;
  totalVolume: number;
  xpEarned: number;
  isPR: boolean;
}

interface ProgramWeek {
  weekNumber: number;
  isDeload: boolean;
  volumeLevel: string;
  days: ProgramDay[];
}

interface ProgramDay {
  dayNumber: number;
  label: string;
  bodyParts: string[];
  exercises: unknown[];
  completed?: boolean;
  completedAt?: number;
}

interface RecoveryScore {
  id: string;
  date: string;
  timestamp: number;
  sleepHours: number;
  sleepQuality: number;
  muscleSoreness: number;
  energyLevel: number;
  stressLevel: number;
  overallReadiness: number;
  notes?: string;
}

interface CardioSession {
  id: string;
  date: string;
  type: string;
  activity: string;
  durationMinutes: number;
  caloriesBurned?: number;
  avgHeartRate?: number;
  distanceKm?: number;
  rpe?: number;
  notes?: string;
}

interface WorkoutData {
  sessions: WorkoutSession[];
  exercisePRs: Record<string, number>;
  exerciseE1RMs?: Record<string, Array<{ date: string; e1rm: number }>>;
  trainingProgram?: {
    id: string;
    name: string;
    phase: string;
    totalWeeks: number;
    daysPerWeek: number;
    splitType: string;
    currentWeek: number;
    currentDayInWeek: number;
    iterationCount: number;
    weeks: ProgramWeek[];
  };
  cardioSessions?: CardioSession[];
  recoveryScores?: RecoveryScore[];
}

interface NutritionLog {
  date: string;
  totalCalories: number;
  totalProtein: number;
  macroHit: boolean;
}

interface BodyLog {
  id: string;
  date: string;
  weight: number;
  bodyFat?: number;
}

interface DietData {
  profile?: { targetCalories?: number; tdee?: number };
  bodyLogs?: BodyLog[];
  nutritionData?: {
    dailyLogs: NutritionLog[];
  };
}

interface FirebaseUserData {
  workoutData?: unknown;
  dietData?: unknown;
  stats?: unknown;
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
