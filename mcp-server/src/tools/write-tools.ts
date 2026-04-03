import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getUserData, updateUserData } from '../firebase.js';
import { calcE1RM } from '../utils/formatters.js';

const DEFAULT_USER_ID = 'JDtFR7FZmGNpmCTkhugfNftpNQl2';

export const writeTools: Tool[] = [
  {
    name: 'update_program_exercises',
    description:
      '修改訓練計劃中特定 week/day 的動作列表。安全規則：不能修改已完成（completed=true）的 day',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID（可選，預設 Edward）' },
        weekNumber: { type: 'number', description: '週次（1-based）' },
        dayNumber: { type: 'number', description: '當週第幾天（1-based）' },
        exercises: {
          type: 'array',
          description: 'ProgramExercise 陣列，取代該 day 的動作列表',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              exerciseType: { type: 'string', description: 'Primary|Secondary|Isolation' },
              targetSets: { type: 'number' },
              targetReps: { type: 'string', description: 'e.g. "8-12"' },
              targetRPE: { type: 'number' },
              targetWeight: { type: 'number' },
              targetMuscles: { type: 'array', items: { type: 'string' } },
              notes: { type: 'string' },
            },
            required: ['name', 'exerciseType', 'targetSets', 'targetReps', 'targetRPE', 'targetMuscles'],
          },
        },
      },
      required: ['weekNumber', 'dayNumber', 'exercises'],
    },
  },
  {
    name: 'swap_exercise',
    description:
      '替換訓練計劃中的特定動作（只影響未完成的 days）。可選擇是否套用到所有未完成的天',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID（可選，預設 Edward）' },
        oldExerciseName: { type: 'string', description: '要替換掉的動作名稱' },
        newExercise: {
          type: 'object',
          description: '新動作的 ProgramExercise 物件',
          properties: {
            name: { type: 'string' },
            exerciseType: { type: 'string' },
            targetSets: { type: 'number' },
            targetReps: { type: 'string' },
            targetRPE: { type: 'number' },
            targetWeight: { type: 'number' },
            targetMuscles: { type: 'array', items: { type: 'string' } },
            notes: { type: 'string' },
          },
          required: ['name', 'exerciseType', 'targetSets', 'targetReps', 'targetRPE', 'targetMuscles'],
        },
        applyToAllFutureDays: {
          type: 'boolean',
          description: '是否套用到所有未完成的天（預設 true）',
        },
      },
      required: ['oldExerciseName', 'newExercise'],
    },
  },
  {
    name: 'add_program_week',
    description: '在訓練計劃末尾新增一週',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID（可選，預設 Edward）' },
        weekData: {
          type: 'object',
          description: 'ProgramWeek 物件',
          properties: {
            isDeload: { type: 'boolean' },
            volumeLevel: { type: 'string', description: 'MEV|MEV+1|MAV|Deload' },
            days: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  dayNumber: { type: 'number' },
                  label: { type: 'string' },
                  bodyParts: { type: 'array', items: { type: 'string' } },
                  exercises: { type: 'array', items: { type: 'object' } },
                },
                required: ['dayNumber', 'label', 'bodyParts', 'exercises'],
              },
            },
          },
          required: ['isDeload', 'volumeLevel', 'days'],
        },
      },
      required: ['weekData'],
    },
  },
  {
    name: 'mark_day_complete',
    description:
      '手動標記某天為已完成，並自動重新計算 currentWeek/currentDayInWeek',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID（可選，預設 Edward）' },
        weekNumber: { type: 'number', description: '週次' },
        dayNumber: { type: 'number', description: '當週第幾天' },
        sessionId: { type: 'string', description: '對應的 WorkoutSession ID（可選）' },
      },
      required: ['weekNumber', 'dayNumber'],
    },
  },
  {
    name: 'update_diet_plan',
    description:
      '更新飲食計劃的宏量目標或計劃內容（merge 方式，不會覆蓋未指定的欄位）',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID（可選，預設 Edward）' },
        macroTargets: {
          type: 'object',
          description: '更新宏量目標（可選）',
          properties: {
            calories: {
              type: 'object',
              properties: { min: { type: 'number' }, max: { type: 'number' } },
            },
            protein: {
              type: 'object',
              properties: { min: { type: 'number' }, max: { type: 'number' } },
            },
            carbs: {
              type: 'object',
              properties: { min: { type: 'number' }, max: { type: 'number' } },
            },
            fat: {
              type: 'object',
              properties: { min: { type: 'number' }, max: { type: 'number' } },
            },
          },
        },
        profileUpdates: {
          type: 'object',
          description: '更新 dietProfile 欄位（targetCalories, tdee, goal 等）',
          properties: {
            targetCalories: { type: 'number' },
            tdee: { type: 'number' },
            goal: { type: 'string' },
          },
        },
        planNotes: { type: 'string', description: '更新計劃備注' },
      },
      required: [],
    },
  },
  {
    name: 'add_body_log',
    description: '新增一筆體重/體脂/肌肉量測量紀錄',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID（可選，預設 Edward）' },
        weight: { type: 'number', description: '體重（kg）' },
        bodyFat: { type: 'number', description: '體脂率（%，可選）' },
        muscleMass: { type: 'number', description: '肌肉量（kg，可選）' },
        date: { type: 'string', description: '日期 YYYY-MM-DD（可選，預設今天）' },
        notes: { type: 'string', description: '備注（可選）' },
      },
      required: ['weight'],
    },
  },
  {
    name: 'add_workout_session',
    description: '新增一次完整的訓練紀錄（含動作、組數、重量、RPE）',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID（可選，預設 Edward）' },
        date: { type: 'string', description: '日期 YYYY-MM-DD（可選，預設今天）' },
        bodyParts: {
          type: 'array',
          items: { type: 'string' },
          description: '訓練部位: chest|back|shoulder|arm|leg|core|cardio',
        },
        exercises: {
          type: 'array',
          description: '訓練動作列表',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '動作名稱' },
              sets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    weight: { type: 'number', description: '重量（kg）' },
                    reps: { type: 'number', description: '次數' },
                    rpe: { type: 'number', description: 'RPE（可選）' },
                  },
                  required: ['weight', 'reps'],
                },
              },
              notes: { type: 'string' },
            },
            required: ['name', 'sets'],
          },
        },
        duration: { type: 'number', description: '訓練時長（分鐘，可選）' },
        notes: { type: 'string', description: '訓練備注（可選）' },
      },
      required: ['bodyParts', 'exercises'],
    },
  },
];

export async function handleWriteTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const userId = (args.userId as string) || DEFAULT_USER_ID;

  switch (name) {
    case 'update_program_exercises':
      return handleUpdateProgramExercises(userId, args);

    case 'swap_exercise':
      return handleSwapExercise(userId, args);

    case 'add_program_week':
      return handleAddProgramWeek(userId, args);

    case 'mark_day_complete':
      return handleMarkDayComplete(userId, args);

    case 'update_diet_plan':
      return handleUpdateDietPlan(userId, args);

    case 'add_body_log':
      return handleAddBodyLog(userId, args);

    case 'add_workout_session':
      return handleAddWorkoutSession(userId, args);

    default:
      throw new Error(`Unknown write tool: ${name}`);
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleUpdateProgramExercises(
  userId: string,
  args: Record<string, unknown>
): Promise<string> {
  const weekNumber = args.weekNumber as number;
  const dayNumber = args.dayNumber as number;
  const exercises = args.exercises as ProgramExercise[];

  const userData = await getUserData(userId);
  const workoutData = userData.workoutData as WorkoutData | undefined;

  if (!workoutData?.trainingProgram) {
    return JSON.stringify({ error: '尚無訓練計劃' });
  }

  const program = workoutData.trainingProgram;
  const week = program.weeks.find((w) => w.weekNumber === weekNumber);
  if (!week) {
    return JSON.stringify({ error: `找不到第 ${weekNumber} 週` });
  }

  const day = week.days.find((d) => d.dayNumber === dayNumber);
  if (!day) {
    return JSON.stringify({ error: `找不到第 ${weekNumber} 週第 ${dayNumber} 天` });
  }

  if (day.completed) {
    return JSON.stringify({ error: '安全規則：無法修改已完成的訓練日', weekNumber, dayNumber });
  }

  // Update exercises in place
  day.exercises = exercises;

  await updateUserData(userId, { workoutData });

  return JSON.stringify({
    success: true,
    message: `已更新第 ${weekNumber} 週第 ${dayNumber} 天的動作（共 ${exercises.length} 個）`,
    weekNumber,
    dayNumber,
    exercisesCount: exercises.length,
  });
}

async function handleSwapExercise(
  userId: string,
  args: Record<string, unknown>
): Promise<string> {
  const oldExerciseName = args.oldExerciseName as string;
  const newExercise = args.newExercise as ProgramExercise;
  const applyToAll = (args.applyToAllFutureDays as boolean) ?? true;

  const userData = await getUserData(userId);
  const workoutData = userData.workoutData as WorkoutData | undefined;

  if (!workoutData?.trainingProgram) {
    return JSON.stringify({ error: '尚無訓練計劃' });
  }

  const program = workoutData.trainingProgram;
  let swappedCount = 0;

  for (const week of program.weeks) {
    for (const day of week.days) {
      if (day.completed) continue; // Skip completed days

      const idx = day.exercises.findIndex(
        (e) => e.name.toLowerCase() === oldExerciseName.toLowerCase()
      );

      if (idx !== -1) {
        day.exercises[idx] = newExercise;
        swappedCount++;
        if (!applyToAll) break; // Only first occurrence
      }
    }
    if (!applyToAll && swappedCount > 0) break;
  }

  if (swappedCount === 0) {
    return JSON.stringify({
      success: false,
      message: `在未完成的訓練日中找不到動作：${oldExerciseName}`,
    });
  }

  await updateUserData(userId, { workoutData });

  return JSON.stringify({
    success: true,
    message: `已將 ${oldExerciseName} 替換為 ${newExercise.name}（${swappedCount} 個訓練日）`,
    swappedCount,
    oldExercise: oldExerciseName,
    newExercise: newExercise.name,
  });
}

async function handleAddProgramWeek(
  userId: string,
  args: Record<string, unknown>
): Promise<string> {
  const weekData = args.weekData as {
    isDeload: boolean;
    volumeLevel: string;
    days: ProgramDay[];
  };

  const userData = await getUserData(userId);
  const workoutData = userData.workoutData as WorkoutData | undefined;

  if (!workoutData?.trainingProgram) {
    return JSON.stringify({ error: '尚無訓練計劃' });
  }

  const program = workoutData.trainingProgram;
  const newWeekNumber = program.weeks.length > 0
    ? Math.max(...program.weeks.map((w) => w.weekNumber)) + 1
    : 1;

  const newWeek = {
    weekNumber: newWeekNumber,
    isDeload: weekData.isDeload,
    volumeLevel: weekData.volumeLevel,
    days: weekData.days.map((d) => ({ ...d, completed: false })),
  };

  program.weeks.push(newWeek);
  program.totalWeeks = program.weeks.length;

  await updateUserData(userId, { workoutData });

  return JSON.stringify({
    success: true,
    message: `已新增第 ${newWeekNumber} 週（${weekData.isDeload ? 'Deload' : weekData.volumeLevel}），共 ${weekData.days.length} 天`,
    newWeekNumber,
    totalWeeks: program.totalWeeks,
  });
}

async function handleMarkDayComplete(
  userId: string,
  args: Record<string, unknown>
): Promise<string> {
  const weekNumber = args.weekNumber as number;
  const dayNumber = args.dayNumber as number;
  const sessionId = args.sessionId as string | undefined;

  const userData = await getUserData(userId);
  const workoutData = userData.workoutData as WorkoutData | undefined;

  if (!workoutData?.trainingProgram) {
    return JSON.stringify({ error: '尚無訓練計劃' });
  }

  const program = workoutData.trainingProgram;
  const week = program.weeks.find((w) => w.weekNumber === weekNumber);
  if (!week) {
    return JSON.stringify({ error: `找不到第 ${weekNumber} 週` });
  }

  const day = week.days.find((d) => d.dayNumber === dayNumber);
  if (!day) {
    return JSON.stringify({ error: `找不到第 ${weekNumber} 週第 ${dayNumber} 天` });
  }

  if (day.completed) {
    return JSON.stringify({ success: false, message: '此訓練日已標記為完成' });
  }

  // Mark as complete
  day.completed = true;
  day.completedAt = Date.now();
  if (sessionId) {
    day.completedSessionId = sessionId;
  }

  // Recalculate currentWeek / currentDayInWeek
  let nextWeek = program.currentWeek;
  let nextDay = program.currentDayInWeek;
  let found = false;

  for (const w of program.weeks.sort((a, b) => a.weekNumber - b.weekNumber)) {
    for (const d of w.days.sort((a, b) => a.dayNumber - b.dayNumber)) {
      if (!d.completed) {
        nextWeek = w.weekNumber;
        nextDay = d.dayNumber;
        found = true;
        break;
      }
    }
    if (found) break;
  }

  if (found) {
    program.currentWeek = nextWeek;
    program.currentDayInWeek = nextDay;
  }

  await updateUserData(userId, { workoutData });

  return JSON.stringify({
    success: true,
    message: `已標記第 ${weekNumber} 週第 ${dayNumber} 天為完成`,
    nextDay: found ? { weekNumber: nextWeek, dayNumber: nextDay } : '計劃已全部完成',
    currentWeek: program.currentWeek,
    currentDayInWeek: program.currentDayInWeek,
  });
}

async function handleUpdateDietPlan(
  userId: string,
  args: Record<string, unknown>
): Promise<string> {
  const macroTargets = args.macroTargets as Record<string, unknown> | undefined;
  const profileUpdates = args.profileUpdates as Record<string, unknown> | undefined;
  const planNotes = args.planNotes as string | undefined;

  const userData = await getUserData(userId);
  const dietData = (userData.dietData as Record<string, unknown>) ?? {};

  const updates: Record<string, unknown> = {};

  if (macroTargets) {
    const existingNutritionData = (dietData.nutritionData as Record<string, unknown>) ?? {};
    updates.dietData = {
      ...dietData,
      nutritionData: {
        ...existingNutritionData,
        macroTargets,
      },
    };
  }

  if (profileUpdates) {
    const existingProfile = (dietData.profile as Record<string, unknown>) ?? {};
    updates.dietData = {
      ...(updates.dietData as Record<string, unknown> ?? dietData),
      profile: { ...existingProfile, ...profileUpdates },
    };
  }

  if (planNotes && dietData.currentPlan) {
    const existingPlan = (dietData.currentPlan as Record<string, unknown>);
    updates.dietData = {
      ...(updates.dietData as Record<string, unknown> ?? dietData),
      currentPlan: { ...existingPlan, aiNotes: planNotes },
    };
  }

  if (Object.keys(updates).length === 0) {
    return JSON.stringify({ success: false, message: '沒有提供任何更新內容' });
  }

  await updateUserData(userId, updates);

  return JSON.stringify({
    success: true,
    message: '飲食計劃已更新',
    updated: {
      macroTargets: !!macroTargets,
      profile: !!profileUpdates,
      planNotes: !!planNotes,
    },
  });
}

async function handleAddBodyLog(
  userId: string,
  args: Record<string, unknown>
): Promise<string> {
  const weight = args.weight as number;
  const bodyFat = args.bodyFat as number | undefined;
  const muscleMass = args.muscleMass as number | undefined;
  const notes = args.notes as string | undefined;
  const date = (args.date as string) || new Date().toISOString().slice(0, 10);

  const userData = await getUserData(userId);
  const dietData = (userData.dietData as Record<string, unknown>) ?? {};
  const bodyLogs = [...((dietData.bodyLogs as unknown[]) ?? [])];

  const newLog: Record<string, unknown> = {
    id: `body_${Date.now()}`,
    date,
    weight,
    timestamp: Date.now(),
  };
  if (bodyFat !== undefined) newLog.bodyFat = bodyFat;
  if (muscleMass !== undefined) newLog.muscleMass = muscleMass;
  if (notes) newLog.notes = notes;

  bodyLogs.push(newLog);

  await updateUserData(userId, {
    dietData: { ...dietData, bodyLogs },
  });

  return JSON.stringify({
    success: true,
    message: `已新增體重紀錄：${weight}kg on ${date}`,
    log: newLog,
  });
}

async function handleAddWorkoutSession(
  userId: string,
  args: Record<string, unknown>
): Promise<string> {
  const date = (args.date as string) || new Date().toISOString().slice(0, 10);
  const bodyParts = args.bodyParts as string[];
  const duration = args.duration as number | undefined;
  const notes = args.notes as string | undefined;
  const inputExercises = args.exercises as Array<{
    name: string;
    sets: Array<{ weight: number; reps: number; rpe?: number }>;
    notes?: string;
  }>;

  const userData = await getUserData(userId);
  const workoutData = (userData.workoutData as Record<string, unknown>) ?? {};
  const sessions = [...((workoutData.sessions as unknown[]) ?? [])];
  const existingPRs = (workoutData.exercisePRs as Record<string, number>) ?? {};

  // Build exercise objects with e1RM calculations
  let totalSets = 0;
  let totalXP = 0;
  const newPRs: string[] = [];

  const exercises = inputExercises.map((ex) => {
    const setsWithE1RM = ex.sets.map((s) => ({
      weight: s.weight,
      reps: s.reps,
      rpe: s.rpe,
      e1rm: calcE1RM(s.weight, s.reps),
    }));

    const bestE1RM = Math.max(...setsWithE1RM.map((s) => s.e1rm));
    const totalVolume = ex.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    const xpEarned = Math.round(totalVolume / 100);
    const isPR = bestE1RM > (existingPRs[ex.name] ?? 0);

    if (isPR) {
      existingPRs[ex.name] = bestE1RM;
      newPRs.push(ex.name);
    }

    totalSets += ex.sets.length;
    totalXP += xpEarned;

    return {
      id: `ex_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: ex.name,
      sets: setsWithE1RM,
      totalVolume,
      xpEarned,
      isPR,
      notes: ex.notes,
    };
  });

  const newSession = {
    id: `session_${Date.now()}`,
    date,
    timestamp: Date.now(),
    bodyParts,
    exercises,
    totalSets,
    totalXP,
    duration,
    notes,
  };

  sessions.push(newSession);

  await updateUserData(userId, {
    workoutData: {
      ...workoutData,
      sessions,
      exercisePRs: existingPRs,
    },
  });

  return JSON.stringify({
    success: true,
    message: `已新增訓練紀錄：${date}，${exercises.length} 個動作，${totalSets} 組`,
    sessionId: newSession.id,
    date,
    totalSets,
    totalXP,
    newPRs,
    exercisesAdded: exercises.map((e) => ({ name: e.name, sets: e.sets.length, isPR: e.isPR })),
  });
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

interface ProgramExercise {
  name: string;
  exerciseType: string;
  targetSets: number;
  targetReps: string;
  targetRPE: number;
  targetWeight?: number;
  targetMuscles: string[];
  notes?: string;
}

interface ProgramDay {
  dayNumber: number;
  label: string;
  bodyParts: string[];
  exercises: ProgramExercise[];
  completed?: boolean;
  completedAt?: number;
  completedSessionId?: string;
}

interface WorkoutData {
  sessions: Array<{
    id: string;
    date: string;
    timestamp: number;
    bodyParts: string[];
    exercises: Array<{
      id: string;
      name: string;
      sets: Array<{ weight: number; reps: number; rpe?: number; e1rm?: number }>;
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
    weeks: Array<{
      weekNumber: number;
      isDeload: boolean;
      volumeLevel: string;
      days: ProgramDay[];
    }>;
  };
}
