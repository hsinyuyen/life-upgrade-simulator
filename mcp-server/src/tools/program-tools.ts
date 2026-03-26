import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getUserData } from '../firebase.js';

export const programTools: Tool[] = [
  {
    name: 'get_training_program',
    description: '取得完整的當前訓練計劃，含每天的動作和完成狀態',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID' },
      },
      required: ['userId'],
    },
  },
];

export async function handleProgramTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const userId = args.userId as string;
  const userData = await getUserData(userId);
  const workoutData = userData.workoutData as WorkoutData | undefined;

  switch (name) {
    case 'get_training_program':
      return handleGetTrainingProgram(workoutData);

    default:
      throw new Error(`Unknown program tool: ${name}`);
  }
}

function handleGetTrainingProgram(workoutData: WorkoutData | undefined): string {
  if (!workoutData?.trainingProgram) {
    return JSON.stringify({ error: '尚無訓練計劃' });
  }

  const program = workoutData.trainingProgram;

  // Summarize progress
  const totalDays = program.weeks.reduce((acc, w) => acc + w.days.length, 0);
  const completedDays = program.weeks.reduce(
    (acc, w) => acc + w.days.filter((d) => d.completed).length,
    0
  );

  // Current week data
  const currentWeekData = program.weeks.find((w) => w.weekNumber === program.currentWeek);
  const nextUncompletedDay = currentWeekData?.days.find((d) => !d.completed);

  return JSON.stringify({
    program: {
      id: program.id,
      name: program.name,
      phase: program.phase,
      splitType: program.splitType,
      specialization: program.specialization,
      totalWeeks: program.totalWeeks,
      daysPerWeek: program.daysPerWeek,
      currentWeek: program.currentWeek,
      currentDayInWeek: program.currentDayInWeek,
      iterationCount: program.iterationCount,
      aiNotes: program.aiNotes,
      createdAt: program.createdAt,
      lastIteratedAt: program.lastIteratedAt,
    },
    progress: {
      totalDays,
      completedDays,
      progressPct: Math.round((completedDays / totalDays) * 100),
      nextDay: nextUncompletedDay
        ? {
            weekNumber: program.currentWeek,
            dayNumber: nextUncompletedDay.dayNumber,
            label: nextUncompletedDay.label,
            bodyParts: nextUncompletedDay.bodyParts,
            exercises: nextUncompletedDay.exercises,
          }
        : null,
    },
    weeks: program.weeks.map((week) => ({
      weekNumber: week.weekNumber,
      isDeload: week.isDeload,
      volumeLevel: week.volumeLevel,
      days: week.days.map((day) => ({
        dayNumber: day.dayNumber,
        label: day.label,
        bodyParts: day.bodyParts,
        completed: day.completed ?? false,
        completedAt: day.completedAt,
        completedSessionId: day.completedSessionId,
        exercises: day.exercises.map((ex) => ({
          name: ex.name,
          exerciseType: ex.exerciseType,
          targetSets: ex.targetSets,
          targetReps: ex.targetReps,
          targetRPE: ex.targetRPE,
          targetWeight: ex.targetWeight,
          targetMuscles: ex.targetMuscles,
          notes: ex.notes,
        })),
      })),
    })),
  });
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

interface WorkoutData {
  trainingProgram?: {
    id: string;
    name: string;
    phase: string;
    totalWeeks: number;
    daysPerWeek: number;
    splitType: string;
    specialization: string[];
    currentWeek: number;
    currentDayInWeek: number;
    iterationCount: number;
    lastIteratedAt?: number;
    aiNotes: string;
    createdAt: number;
    weeks: Array<{
      weekNumber: number;
      isDeload: boolean;
      volumeLevel: string;
      days: Array<{
        dayNumber: number;
        label: string;
        bodyParts: string[];
        exercises: Array<{
          name: string;
          exerciseType: string;
          targetSets: number;
          targetReps: string;
          targetRPE: number;
          targetWeight?: number;
          targetMuscles: string[];
          notes?: string;
        }>;
        completed?: boolean;
        completedSessionId?: string;
        completedAt?: number;
      }>;
    }>;
  };
}
