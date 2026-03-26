import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getUserData } from '../firebase.js';
import { filterByDays } from '../utils/formatters.js';

export const dietTools: Tool[] = [
  {
    name: 'get_diet_profile',
    description: '取得飲食 profile（身高、體重、目標、TDEE）和當前飲食計劃（食譜、巨量營養素）',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'get_nutrition_logs',
    description: '取得每日營養攝取紀錄，含每餐明細和巨量營養素合計',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Firebase Auth UID' },
        days: { type: 'number', description: '查幾天（預設 7）' },
      },
      required: ['userId'],
    },
  },
];

export async function handleDietTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const userId = args.userId as string;
  const userData = await getUserData(userId);
  const dietData = userData.dietData as DietData | undefined;

  switch (name) {
    case 'get_diet_profile':
      return handleGetDietProfile(dietData);

    case 'get_nutrition_logs':
      return handleGetNutritionLogs(dietData, args);

    default:
      throw new Error(`Unknown diet tool: ${name}`);
  }
}

function handleGetDietProfile(dietData: DietData | undefined): string {
  if (!dietData) {
    return JSON.stringify({ error: '無飲食資料' });
  }

  return JSON.stringify({
    profile: dietData.profile,
    currentPlan: dietData.currentPlan
      ? {
          id: dietData.currentPlan.id,
          createdAt: dietData.currentPlan.createdAt,
          totalCalories: dietData.currentPlan.totalCalories,
          totalProtein: dietData.currentPlan.totalProtein,
          totalCarbs: dietData.currentPlan.totalCarbs,
          totalFat: dietData.currentPlan.totalFat,
          aiNotes: dietData.currentPlan.aiNotes,
          recipesCount: dietData.currentPlan.recipes?.length ?? 0,
          recipes: dietData.currentPlan.recipes?.map((r) => ({
            id: r.id,
            name: r.name,
            mealType: r.mealType,
            calories: r.calories,
            protein: r.protein,
            carbs: r.carbs,
            fat: r.fat,
          })),
          restDayPlan: dietData.currentPlan.restDayPlan
            ? {
                totalCalories: dietData.currentPlan.restDayPlan.totalCalories,
                totalProtein: dietData.currentPlan.restDayPlan.totalProtein,
              }
            : null,
        }
      : null,
    macroTargets: dietData.nutritionData?.macroTargets ?? null,
    planHistoryCount: dietData.planHistory?.length ?? 0,
  });
}

function handleGetNutritionLogs(dietData: DietData | undefined, args: Record<string, unknown>): string {
  if (!dietData?.nutritionData?.dailyLogs) {
    return JSON.stringify({ error: '無營養紀錄', logs: [] });
  }

  const days = (args.days as number) ?? 7;
  const logs = filterByDays(dietData.nutritionData.dailyLogs, days);
  logs.sort((a, b) => b.date.localeCompare(a.date));

  const targets = dietData.nutritionData.macroTargets;

  return JSON.stringify({
    days,
    logsFound: logs.length,
    macroTargets: targets,
    logs: logs.map((log) => ({
      date: log.date,
      totalCalories: log.totalCalories,
      totalProtein: log.totalProtein,
      totalCarbs: log.totalCarbs,
      totalFat: log.totalFat,
      macroHit: log.macroHit,
      entriesCount: log.entries?.length ?? 0,
      entries: log.entries?.map((entry) => ({
        name: entry.name,
        calories: entry.calories,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
        servings: entry.servings,
        servingSize: entry.servingSize,
      })),
    })),
    summary: {
      avgCalories: logs.length > 0
        ? Math.round(logs.reduce((s, l) => s + l.totalCalories, 0) / logs.length)
        : 0,
      avgProtein: logs.length > 0
        ? Math.round(logs.reduce((s, l) => s + l.totalProtein, 0) / logs.length)
        : 0,
      macroHitDays: logs.filter((l) => l.macroHit).length,
      macroHitPct: logs.length > 0
        ? Math.round((logs.filter((l) => l.macroHit).length / logs.length) * 100)
        : 0,
    },
  });
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

interface DietData {
  profile: {
    height: number;
    weight: number;
    muscleMass?: number;
    bodyFat?: number;
    goal: string;
    preferences: string;
    tdee?: number;
    targetCalories?: number;
  } | null;
  bodyLogs: Array<{ id: string; date: string; weight: number; bodyFat?: number; muscleMass?: number; notes?: string }>;
  currentPlan: {
    id: string;
    createdAt: number;
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
    aiNotes?: string;
    recipes?: Array<{
      id: string;
      name: string;
      mealType: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }>;
    restDayPlan?: {
      totalCalories: number;
      totalProtein: number;
    };
  } | null;
  planHistory: unknown[];
  nutritionData?: {
    savedFoods: unknown[];
    dailyLogs: Array<{
      date: string;
      entries: Array<{
        id: string;
        name: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        servings: number;
        servingSize?: string;
        timestamp: number;
      }>;
      totalCalories: number;
      totalProtein: number;
      totalCarbs: number;
      totalFat: number;
      macroHit: boolean;
    }>;
    macroTargets: {
      calories: { min: number; max: number };
      protein: { min: number; max: number };
      carbs: { min: number; max: number };
      fat: { min: number; max: number };
    } | null;
  };
}
