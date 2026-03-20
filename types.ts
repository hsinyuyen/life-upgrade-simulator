
export enum Category {
  HEALTH = 'Health',
  CAREER = 'Career',
  KNOWLEDGE = 'Knowledge',
  FAMILY_SOCIAL = 'Family & Socializing',
  LEISURE = 'Leisure'
}

export interface Activity {
  id: string;
  timestamp: number;
  description: string;
  points: number;
  category: Category;
  analysis: string;
  isEmergency?: boolean;
  isDeduction?: boolean;
}

export interface QuestItem {
  item: string;
  category: string;
  base_points: number;
  isDeduction?: boolean;        // 是否為扣分類型活動
  isEmergency?: boolean;        // 是否為緊急任務
  emergencyCreatedAt?: number;  // 緊急任務建立時間 (timestamp)
  emergencyApproved?: boolean;  // AI 是否已批准
  // Diminishing returns fields
  unitLabel?: string;           // 單位標籤 (e.g. "分鐘", "頁", "公里")
  unitBase?: number;            // 基礎單位 (e.g. 10 = 10分鐘為基礎)
  decayPerRepeat?: number;      // 每次重複後減少的 XP (e.g. 20 = 每次少20XP，可設為負)
  minPoints?: number;           // 最低點數 (可為負數)
}

export interface DailyDebuff {
  active: boolean;
  reason: string;               // "deduction" | "emergency"
  multiplier: number;           // e.g. 0.5 = 50% off
  expiresAt: number;            // timestamp: 23:59 of the day
}

export interface EmergencyDebuff {
  active: boolean;
  missionName: string;
  daysDelayed: number;
  multiplier: number;           // 1 - 0.1*daysDelayed
  createdAt: number;
}

// Track how many times an activity was performed today
export interface DailyActivityCount {
  [questItem: string]: number;  // item name -> count today
}

export interface UserStats {
  level: number;
  // 4 XP bars - each needs to reach xpToNextLevel to level up
  healthXP: number;
  careerXP: number;
  knowledgeXP: number;
  familySocialXP: number;
  xpToNextLevel: number;        // XP needed per bar to level up (e.g. 1000)
  totalPoints: number;
  streak: number;
  // Debuff tracking
  dailyDebuff?: DailyDebuff;
  emergencyDebuffs?: EmergencyDebuff[];
  dailyActivityCounts?: DailyActivityCount;
  lastActivityDate?: string;    // YYYY-MM-DD to reset daily counts
  // Nutrition buff
  nutritionBuff?: NutritionBuff;
  // Daily neurozoids: pool = XP earned today, spent on deduction activities; resets each day
  neurozoidsToday?: number;
  // Deduction activities count (each adds 20% debuff, stacks)
  deductionsCountToday?: number;
  // Log points: earned 1 per day when logging any activity
  logPoints?: number;
  lastLogDate?: string; // YYYY-MM-DD for log point tracking
  // Avatar
  basePhoto?: string;
  avatarUrl?: string;
  currentLevelAvatar?: string;
  // Character Skins (AI-generated 4-state sets)
  characterSkins?: CharacterSkin[];
  equippedCharacterSkin?: string | null;  // CharacterSkin.id
  baseCharacterGenerated?: boolean;       // first free generation done?
  // Legacy Decorations/Skins
  unlockedSkins?: string[]; // array of skin IDs
  equippedSkin?: string | null;    // current skin ID
}

// ===== Character Skin Types =====

export interface CharacterSkin {
  id: string;
  name: string;
  theme: string;
  normal: string;     // Firebase Storage URL for normal state
  buff: string;       // Firebase Storage URL for buff state
  debuff: string;     // Firebase Storage URL for debuff state
  both: string;       // Firebase Storage URL for buff+debuff state
  createdAt: number;
  animated?: boolean;
  normalVideo?: string;   // Firebase Storage URL for MP4
  buffVideo?: string;
  debuffVideo?: string;
  bothVideo?: string;
}

// Legacy skin decoration (kept for backwards compat)
export interface SkinDecoration {
  id: string;
  name: string;
  gifUrl: string;
  price: number;
  category: 'head' | 'body' | 'aura' | 'effect';
}

// ===== Diet Panel Types =====

export interface BodyLog {
  id: string;
  date: string;           // YYYY-MM-DD
  weight: number;         // kg
  bodyFat?: number;       // %
  muscleMass?: number;    // kg
  notes?: string;
}

export interface DietProfile {
  height: number;         // cm
  weight: number;         // kg
  muscleMass?: number;    // kg
  bodyFat?: number;       // %
  goal: 'bulk' | 'cut' | 'recomp';
  preferences: string;    // e.g. "vegetarian", "no dairy", "high protein"
  tdee?: number;          // Total Daily Energy Expenditure (calculated)
  targetCalories?: number;
}

export interface GroceryItem {
  name: string;
  amount: string;
  category: string;       // e.g. "Protein", "Vegetables", "Dairy"
  checked?: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  ingredients: string[];
  instructions: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servings: number;
  adjustedServings?: number;
}

export interface DietPlan {
  id: string;
  createdAt: number;
  recipes: Recipe[];
  groceryList: GroceryItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  aiNotes?: string;
}

export interface DietData {
  profile: DietProfile | null;
  bodyLogs: BodyLog[];
  currentPlan: DietPlan | null;
  planHistory: DietPlan[];
  nutritionData?: NutritionData;
}

// ===== Nutrition Tracker Types =====

export interface FoodEntry {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servings: number;
  servingSize?: string;       // e.g. "100g", "1 cup"
  source: 'barcode' | 'search' | 'manual' | 'saved';
  barcode?: string;
  timestamp: number;
}

export interface SavedFood {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: string;
  barcode?: string;
  timesUsed: number;
  createdAt: number;
}

export interface DailyNutritionLog {
  date: string;               // YYYY-MM-DD
  entries: FoodEntry[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  macroHit: boolean;          // whether macros were within target range
}

export interface MacroTargets {
  calories: { min: number; max: number };
  protein: { min: number; max: number };
  carbs: { min: number; max: number };
  fat: { min: number; max: number };
}

export interface NutritionBuff {
  active: boolean;
  multiplier: number;         // e.g. 1.25 = +25% XP
  expiresAt: number;          // timestamp
  reason: string;
}

export interface NutritionData {
  savedFoods: SavedFood[];
  dailyLogs: DailyNutritionLog[];
  macroTargets: MacroTargets | null;
}

// ===== Workout Panel Types =====

export type BodyPart = 'chest' | 'back' | 'shoulder' | 'arm' | 'leg' | 'core' | 'cardio';

export const BODY_PARTS: { key: BodyPart; label: string; emoji: string }[] = [
  { key: 'chest', label: 'Chest', emoji: '🫁' },
  { key: 'back', label: 'Back', emoji: '🔙' },
  { key: 'shoulder', label: 'Shoulder', emoji: '💪' },
  { key: 'arm', label: 'Arm', emoji: '🦾' },
  { key: 'leg', label: 'Leg', emoji: '🦵' },
  { key: 'core', label: 'Core', emoji: '🎯' },
  { key: 'cardio', label: 'Cardio', emoji: '❤️' },
];

export type ExerciseType = 'Primary' | 'Secondary' | 'Isolation';
export type TrainingPhase = 'Bulk' | 'Cut' | 'Recomp';
export type DeloadType = 'volume' | 'intensity' | 'full';

export const EXERCISE_TIER_CONFIG: Record<ExerciseType, { repRange: [number, number]; increment: number; label: string }> = {
  Primary:   { repRange: [4, 6],   increment: 2.5, label: 'Primary' },
  Secondary: { repRange: [8, 12],  increment: 2.5, label: 'Secondary' },
  Isolation: { repRange: [12, 15], increment: 1.0, label: 'Isolation' },
};

export const PHASE_CONFIG: Record<TrainingPhase, {
  volumeCeiling: number;
  progressionRate: 'aggressive' | 'moderate' | 'conservative';
  deloadFrequency: number;
  motto: string;
}> = {
  Bulk:   { volumeCeiling: 1.0,  progressionRate: 'aggressive',   deloadFrequency: 6, motto: 'Push heavier' },
  Cut:    { volumeCeiling: 0.7,  progressionRate: 'conservative', deloadFrequency: 4, motto: 'Maintain strength' },
  Recomp: { volumeCeiling: 0.85, progressionRate: 'moderate',     deloadFrequency: 5, motto: 'Balance growth & recovery' },
};

export interface ExerciseSet {
  weight: number;
  reps: number;
  rpe?: number;
  targetWeight?: number;
  targetReps?: string;
  targetRPE?: number;
}

export interface Exercise {
  id: string;
  name: string;
  sets: ExerciseSet[];
  totalVolume: number;
  xpEarned: number;
  isPR: boolean;
}

export interface WorkoutSession {
  id: string;
  date: string;
  timestamp: number;
  bodyParts: BodyPart[];
  exercises: Exercise[];
  totalSets: number;
  totalXP: number;
  duration?: number;
  notes?: string;
}

export interface ExercisePR {
  [exerciseName: string]: number; // exercise name -> best e1RM
}

export interface SavedExercise {
  id: string;
  name: string;
  lastWeight: number;
  lastUsed: number;
  exerciseType?: ExerciseType;
  targetMuscles?: BodyPart[];
}

export interface WorkoutRoutine {
  id: string;
  name: string;
  bodyParts: BodyPart[];
  exerciseNames: string[];
  createdAt: number;
}

export interface TrainingCycle {
  week: number;
  phase: TrainingPhase;
  specializationFocus?: BodyPart;
  accumulatedFatigue: number;
}

export interface E1RMEntry {
  date: string;
  e1rm: number;
}

// ===== Training Program Types =====

export interface ProgramExercise {
  name: string;
  exerciseType: ExerciseType;
  targetSets: number;
  targetReps: string;
  targetRPE: number;
  targetWeight?: number;
  targetMuscles: BodyPart[];
  notes?: string;
}

export interface ProgramDay {
  dayNumber: number;
  label: string;
  bodyParts: BodyPart[];
  exercises: ProgramExercise[];
  completed?: boolean;
  completedSessionId?: string;
  completedAt?: number;
}

export interface ProgramWeek {
  weekNumber: number;
  isDeload: boolean;
  volumeLevel: string;
  days: ProgramDay[];
}

export interface TrainingProgram {
  id: string;
  name: string;
  phase: TrainingPhase;
  totalWeeks: number;
  daysPerWeek: number;
  splitType: string;
  specialization: BodyPart[];
  weeks: ProgramWeek[];
  createdAt: number;
  aiNotes: string;
  currentWeek: number;
  currentDayInWeek: number;
  iterationCount: number;
  lastIteratedAt?: number;
}

export interface WorkoutData {
  sessions: WorkoutSession[];
  exercisePRs: ExercisePR;
  savedExercises?: SavedExercise[];
  routines?: WorkoutRoutine[];
  currentCycle?: TrainingCycle;
  exerciseE1RMs?: Record<string, E1RMEntry[]>;
  trainingProgram?: TrainingProgram;
}

// ===== Story Quest Types =====

export interface StoryChoice {
  chapterId: string;
  choiceText: string;
  summary: string;           // Short summary for AI context
  timestamp: number;
}

export interface StoryChapter {
  id: string;
  milestone: number;          // XP value that triggered this (e.g. 250, 500)
  category: Category;         // Which XP bar triggered it
  narrative: string;          // The story segment
  missionDescription: string; // Real-world task
  imageUrl?: string;          // AI-generated image for this chapter
  choiceOptions?: string[];   // 2-3 branching choices
  choiceMade?: string;        // What the player picked
  completed: boolean;         // Mission done?
  completedAt?: number;
  createdAt: number;
}

export interface StoryState {
  initialized: boolean;
  genre: string;              // e.g. "dark fantasy", "cyberpunk", "space opera"
  storyBible: string;         // AI-generated overarching plot (hidden from player)
  storySummary: string;       // Compressed summary of all past events
  chapters: StoryChapter[];
  currentArc: number;         // Corresponds to player level (1-10)
  choicesMade: StoryChoice[];
  pendingMission: StoryChapter | null;  // Current active story quest
  lastMilestones: {           // Track last triggered milestone per category
    [Category.HEALTH]: number;
    [Category.CAREER]: number;
    [Category.KNOWLEDGE]: number;
    [Category.FAMILY_SOCIAL]: number;
  };
}

// ===== AI Response Types =====

export interface GeminiAnalysisResponse {
  points: number;
  category: Category;
  message: string;
}

export interface EmergencyApprovalResponse {
  approved: boolean;
  reason: string;
}
