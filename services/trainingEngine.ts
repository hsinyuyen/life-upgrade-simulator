import {
  ExerciseType, ExerciseSet, WorkoutSession, TrainingPhase,
  BodyPart, SavedExercise, DeloadType,
  EXERCISE_TIER_CONFIG, PHASE_CONFIG,
  WorkoutData, DietData, TrendSnapshot, RecoveryScore,
  CardioSession, WeeklyReport,
} from '../types';

export type ProgressionAction = 'INCREASE_WEIGHT' | 'INCREASE_REPS' | 'MAINTAIN' | 'DELOAD';

export interface ProgressionSuggestion {
  action: ProgressionAction;
  weight: number;
  reps: string;
  sets?: number;
  deloadType?: DeloadType;
  reason: string;
}

export interface ExerciseHistory {
  weight: number;
  reps: number[];
  avgRpe: number;
  sets: number;
  fatigueScore?: number;
}

export class TrainingEngine {
  private phase: TrainingPhase;

  constructor(phase: TrainingPhase = 'Recomp') {
    this.phase = phase;
  }

  setPhase(phase: TrainingPhase) {
    this.phase = phase;
  }

  calculateE1RM(weight: number, reps: number): number {
    if (reps <= 0 || reps >= 37 || weight <= 0) return 0;
    if (reps === 1) return weight;
    return Math.round(weight * (36 / (37 - reps)) * 10) / 10;
  }

  getBestE1RM(sets: ExerciseSet[]): number {
    let best = 0;
    for (const s of sets) {
      if (s.weight > 0 && s.reps > 0) {
        const e1rm = this.calculateE1RM(s.weight, s.reps);
        if (e1rm > best) best = e1rm;
      }
    }
    return best;
  }

  /**
   * Rep-range-aware double progression.
   * INCREASE_WEIGHT only when ALL working sets hit the top of the rep range.
   */
  getNextStep(exerciseType: ExerciseType, history: ExerciseHistory): ProgressionSuggestion {
    const { weight, reps, avgRpe, sets, fatigueScore = 0 } = history;
    const tier = EXERCISE_TIER_CONFIG[exerciseType];
    const [repMin, repMax] = tier.repRange;

    if (avgRpe >= 10 || fatigueScore > 8) {
      const dt = this.pickDeloadType(avgRpe, sets, fatigueScore);
      return this.buildDeload(dt, weight, repMin, repMax, sets);
    }

    const allSetsHitTop = reps.length > 0 && reps.every(r => r >= repMax);
    if (allSetsHitTop && avgRpe <= 9) {
      return {
        action: 'INCREASE_WEIGHT',
        weight: weight + tier.increment,
        reps: `${repMin}-${repMax}`,
        reason: `All sets hit ${repMax} reps — increase weight`,
      };
    }

    const avgReps = reps.reduce((a, b) => a + b, 0) / reps.length;
    if (avgRpe <= 7 && avgReps < repMax) {
      return {
        action: 'INCREASE_REPS',
        weight,
        reps: `${repMin}-${repMax}`,
        reason: `RPE low (${avgRpe}) — push towards ${repMax} reps per set`,
      };
    }

    return {
      action: 'MAINTAIN',
      weight,
      reps: `${repMin}-${repMax}`,
      reason: 'On track — continue progressive overload',
    };
  }

  private pickDeloadType(avgRpe: number, sets: number, fatigue: number): DeloadType {
    if (avgRpe >= 10 && sets > 4) return 'full';
    if (sets >= 5) return 'volume';
    return 'intensity';
  }

  private buildDeload(
    type: DeloadType, weight: number, repMin: number, repMax: number, sets: number
  ): ProgressionSuggestion {
    // Correct deload strategy: keep weight or slight reduction, reduce sets by 1, lower RPE 1-2
    const reasons: Record<DeloadType, string> = {
      volume: 'Volume deload — keep weight, drop 1 set per exercise, RPE cap 6-7',
      intensity: 'Intensity deload — reduce weight 5-10%, keep sets, RPE cap 6-7',
      full: 'Full deload — reduce weight 10%, drop 1 set, RPE cap 5-6',
    };
    switch (type) {
      case 'volume':
        return { action: 'DELOAD', weight, reps: `${repMin}-${repMax}`, sets: Math.max(2, sets - 1), deloadType: type, reason: reasons[type] };
      case 'intensity':
        return { action: 'DELOAD', weight: Math.round(weight * 0.92 * 10) / 10, reps: `${repMin}-${repMax}`, sets, deloadType: type, reason: reasons[type] };
      case 'full':
      default:
        return { action: 'DELOAD', weight: Math.round(weight * 0.9 * 10) / 10, reps: `${repMin}-${repMax}`, sets: Math.max(2, sets - 1), deloadType: type, reason: reasons[type] };
    }
  }

  /**
   * Count hard sets per muscle group in the last `windowDays` days.
   * Uses SavedExercise.targetMuscles to map exercises to body parts.
   */
  getWeeklyMuscleSetCount(
    sessions: WorkoutSession[],
    savedExercises: SavedExercise[],
    windowDays = 7
  ): Record<BodyPart, number> {
    const counts: Record<BodyPart, number> = {
      chest: 0, back: 0, shoulder: 0, arm: 0, leg: 0, core: 0, cardio: 0,
    };
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const muscleMap = new Map<string, BodyPart[]>();
    for (const se of savedExercises) {
      if (se.targetMuscles && se.targetMuscles.length > 0) {
        muscleMap.set(se.name.toLowerCase(), se.targetMuscles);
      }
    }

    for (const session of sessions) {
      if (session.timestamp < cutoff) continue;
      for (const ex of session.exercises) {
        const muscles = muscleMap.get(ex.name.toLowerCase()) || session.bodyParts;
        const hardSets = ex.sets.length;
        for (const bp of muscles) {
          counts[bp] = (counts[bp] || 0) + hardSets;
        }
      }
    }
    return counts;
  }

  /**
   * Per-bodypart fatigue (0-10) based on recent RPE and volume for each muscle group.
   */
  calculateBodyPartFatigue(
    sessions: WorkoutSession[],
    savedExercises: SavedExercise[],
    windowDays = 7
  ): Record<BodyPart, number> {
    const fatigue: Record<BodyPart, number> = {
      chest: 0, back: 0, shoulder: 0, arm: 0, leg: 0, core: 0, cardio: 0,
    };
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const muscleMap = new Map<string, BodyPart[]>();
    for (const se of savedExercises) {
      if (se.targetMuscles?.length) muscleMap.set(se.name.toLowerCase(), se.targetMuscles);
    }

    const bpRpe: Record<BodyPart, number[]> = {
      chest: [], back: [], shoulder: [], arm: [], leg: [], core: [], cardio: [],
    };

    for (const session of sessions) {
      if (session.timestamp < cutoff) continue;
      for (const ex of session.exercises) {
        const muscles = muscleMap.get(ex.name.toLowerCase()) || session.bodyParts;
        for (const set of ex.sets) {
          if (set.rpe != null && set.rpe > 0) {
            for (const bp of muscles) {
              bpRpe[bp].push(set.rpe);
            }
          }
        }
      }
    }

    for (const bp of Object.keys(bpRpe) as BodyPart[]) {
      const vals = bpRpe[bp];
      if (vals.length === 0) { fatigue[bp] = 0; continue; }
      const avgRpe = vals.reduce((a, b) => a + b, 0) / vals.length;
      const frequencyFactor = Math.min(vals.length / 20, 1.5);
      fatigue[bp] = Math.round(Math.min(10, (avgRpe / 10) * 7 + frequencyFactor * 3) * 10) / 10;
    }
    return fatigue;
  }

  getOverallFatigue(sessions: WorkoutSession[], windowDays = 7): number {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const relevant = sessions.filter(s => s.timestamp >= cutoff);
    if (relevant.length === 0) return 0;

    let totalRpe = 0;
    let rpeCount = 0;
    for (const session of relevant) {
      for (const ex of session.exercises) {
        for (const set of ex.sets) {
          if (set.rpe != null && set.rpe > 0) { totalRpe += set.rpe; rpeCount++; }
        }
      }
    }
    const avgRpe = rpeCount > 0 ? totalRpe / rpeCount : 5;
    const frequencyFactor = Math.min(relevant.length / 5, 1.5);
    return Math.round(Math.min(10, Math.max(0, (avgRpe / 10) * 7 + frequencyFactor * 3)) * 10) / 10;
  }

  /**
   * Build ExerciseHistory from the most recent session containing the named exercise.
   * Returns per-set reps array for rep-range-aware progression.
   */
  getLastExerciseHistory(
    exerciseName: string,
    sessions: WorkoutSession[],
    fatigueScore = 0
  ): ExerciseHistory | null {
    for (const session of sessions) {
      const ex = session.exercises.find(
        e => e.name.toLowerCase() === exerciseName.toLowerCase()
      );
      if (ex && ex.sets.length > 0) {
        const rpeVals = ex.sets.filter(s => s.rpe != null && s.rpe > 0).map(s => s.rpe!);
        const avgRpe = rpeVals.length > 0 ? rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length : 0;
        return {
          weight: ex.sets[0].weight,
          reps: ex.sets.map(s => s.reps),
          avgRpe: Math.round(avgRpe * 10) / 10,
          sets: ex.sets.length,
          fatigueScore,
        };
      }
    }
    return null;
  }

  // ===== Helper =====

  /** Returns ISO week string like "2026-W12" for a given timestamp. */
  private getISOWeekString(timestamp: number): string {
    const d = new Date(timestamp);
    d.setUTCHours(0, 0, 0, 0);
    // Thursday in current week decides the year
    d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  /** Parse "YYYY-MM-DD" to a timestamp (UTC midnight). */
  private parseDateStr(dateStr: string): number {
    return new Date(dateStr + 'T00:00:00Z').getTime();
  }

  // ===== New Methods =====

  /**
   * Compute recovery readiness from subjective metrics.
   * Formula: (sleepQuality*0.3) + (energyLevel*0.25) + ((10-muscleSoreness)*0.25) + ((10-stressLevel)*0.2)
   * Clamped 1-10, rounded to 1 decimal.
   */
  computeRecoveryReadiness(score: Omit<RecoveryScore, 'id' | 'overallReadiness'>): number {
    const raw =
      score.sleepQuality * 0.3 +
      score.energyLevel * 0.25 +
      (10 - score.muscleSoreness) * 0.25 +
      (10 - score.stressLevel) * 0.2;
    return Math.round(Math.min(10, Math.max(1, raw)) * 10) / 10;
  }

  /**
   * Build a TrendSnapshot aggregating workout and diet data for dashboards / AI.
   */
  buildTrendSnapshot(workoutData: WorkoutData, dietData: DietData): TrendSnapshot {
    const now = Date.now();
    const fourWeeksAgo = now - 28 * 86400000;
    const eightWeeksAgo = now - 56 * 86400000;

    // --- e1rmTrends: top 5 exercises by frequency, weekly best e1RM over last 4 weeks ---
    const exerciseFreq = new Map<string, number>();
    const exerciseWeeklyE1RM = new Map<string, Map<string, number>>();
    for (const session of workoutData.sessions) {
      if (session.timestamp < fourWeeksAgo) continue;
      const week = this.getISOWeekString(session.timestamp);
      for (const ex of session.exercises) {
        exerciseFreq.set(ex.name, (exerciseFreq.get(ex.name) || 0) + 1);
        const best = this.getBestE1RM(ex.sets);
        if (best > 0) {
          if (!exerciseWeeklyE1RM.has(ex.name)) exerciseWeeklyE1RM.set(ex.name, new Map());
          const weekMap = exerciseWeeklyE1RM.get(ex.name)!;
          weekMap.set(week, Math.max(weekMap.get(week) || 0, best));
        }
      }
    }
    const top5Exercises = [...exerciseFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    const e1rmTrends = top5Exercises.map(exercise => {
      const weekMap = exerciseWeeklyE1RM.get(exercise) || new Map();
      const values = [...weekMap.entries()]
        .map(([week, e1rm]) => ({ week, e1rm }))
        .sort((a, b) => a.week.localeCompare(b.week));
      return { exercise, values };
    });

    // --- weeklyVolume: last 4 weeks ---
    const volumeByWeek = new Map<string, { totalSets: number; totalVolume: number }>();
    for (const session of workoutData.sessions) {
      if (session.timestamp < fourWeeksAgo) continue;
      const week = this.getISOWeekString(session.timestamp);
      const entry = volumeByWeek.get(week) || { totalSets: 0, totalVolume: 0 };
      for (const ex of session.exercises) {
        entry.totalSets += ex.sets.length;
        for (const s of ex.sets) {
          entry.totalVolume += s.weight * s.reps;
        }
      }
      volumeByWeek.set(week, entry);
    }
    const weeklyVolume = [...volumeByWeek.entries()]
      .map(([week, v]) => ({ week, ...v }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // --- weightTrend: last 8 entries from bodyLogs ---
    const weightTrend = dietData.bodyLogs
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-8)
      .map(l => ({ date: l.date, weight: l.weight }));

    // --- bodyFatTrend: last 8 entries where bodyFat exists ---
    const bodyFatTrend = dietData.bodyLogs
      .filter(l => l.bodyFat != null)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-8)
      .map(l => ({ date: l.date, bodyFat: l.bodyFat! }));

    // --- caloriesTrend & proteinTrend: weekly avg vs target, last 4 weeks ---
    const targetCalories = dietData.currentPlan?.totalCalories || 0;
    const targetProtein = dietData.currentPlan?.totalProtein || 0;
    const dailyLogs = dietData.nutritionData?.dailyLogs || [];

    const calByWeek = new Map<string, number[]>();
    const proByWeek = new Map<string, number[]>();
    for (const log of dailyLogs) {
      const ts = this.parseDateStr(log.date);
      if (ts < fourWeeksAgo) continue;
      const week = this.getISOWeekString(ts);
      if (!calByWeek.has(week)) calByWeek.set(week, []);
      if (!proByWeek.has(week)) proByWeek.set(week, []);
      calByWeek.get(week)!.push(log.totalCalories);
      proByWeek.get(week)!.push(log.totalProtein);
    }

    const caloriesTrend = [...calByWeek.entries()]
      .map(([week, vals]) => ({
        week,
        avgCalories: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        target: targetCalories,
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    const proteinTrend = [...proByWeek.entries()]
      .map(([week, vals]) => ({
        week,
        avgProtein: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        target: targetProtein,
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // --- readinessTrend: weekly avg readiness ---
    const readByWeek = new Map<string, number[]>();
    for (const rs of workoutData.recoveryScores || []) {
      if (rs.timestamp < fourWeeksAgo) continue;
      const week = this.getISOWeekString(rs.timestamp);
      if (!readByWeek.has(week)) readByWeek.set(week, []);
      readByWeek.get(week)!.push(rs.overallReadiness);
    }
    const readinessTrend = [...readByWeek.entries()]
      .map(([week, vals]) => ({
        week,
        avgReadiness: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // --- cardioTrend: weekly total minutes and count ---
    const cardioByWeek = new Map<string, { totalMinutes: number; sessions: number }>();
    for (const cs of workoutData.cardioSessions || []) {
      if (cs.timestamp < fourWeeksAgo) continue;
      const week = this.getISOWeekString(cs.timestamp);
      const entry = cardioByWeek.get(week) || { totalMinutes: 0, sessions: 0 };
      entry.totalMinutes += cs.durationMinutes;
      entry.sessions += 1;
      cardioByWeek.set(week, entry);
    }
    const cardioTrend = [...cardioByWeek.entries()]
      .map(([week, v]) => ({ week, ...v }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return {
      e1rmTrends,
      weeklyVolume,
      weightTrend,
      bodyFatTrend,
      caloriesTrend,
      proteinTrend,
      readinessTrend,
      cardioTrend,
    };
  }

  /**
   * Get diet compliance stats for the last N days.
   * Compliance = % of days where total calories are within ±10% of target.
   */
  getDietCompliance(
    dietData: DietData,
    days: number = 7
  ): { compliancePct: number; avgCalories: number; avgProtein: number; daysTracked: number } {
    const targetCalories = dietData.currentPlan?.totalCalories || 0;
    const dailyLogs = dietData.nutritionData?.dailyLogs || [];
    const cutoffDate = new Date(Date.now() - days * 86400000)
      .toISOString()
      .slice(0, 10);

    const recentLogs = dailyLogs.filter(l => l.date >= cutoffDate);
    if (recentLogs.length === 0) {
      return { compliancePct: 0, avgCalories: 0, avgProtein: 0, daysTracked: 0 };
    }

    let compliantDays = 0;
    let totalCal = 0;
    let totalPro = 0;
    for (const log of recentLogs) {
      totalCal += log.totalCalories;
      totalPro += log.totalProtein;
      if (targetCalories > 0) {
        const deviation = Math.abs(log.totalCalories - targetCalories) / targetCalories;
        if (deviation <= 0.1) compliantDays++;
      }
    }

    return {
      compliancePct: targetCalories > 0
        ? Math.round((compliantDays / recentLogs.length) * 100)
        : 0,
      avgCalories: Math.round(totalCal / recentLogs.length),
      avgProtein: Math.round(totalPro / recentLogs.length),
      daysTracked: recentLogs.length,
    };
  }

  /**
   * Build a concise text context (<500 chars) for AI prompts summarizing recent trends.
   */
  buildAIContext(workoutData: WorkoutData, dietData: DietData): string {
    const snap = this.buildTrendSnapshot(workoutData, dietData);
    const compliance = this.getDietCompliance(dietData, 7);
    const parts: string[] = [];

    // e1RM direction
    for (const t of snap.e1rmTrends.slice(0, 3)) {
      if (t.values.length >= 2) {
        const last = t.values[t.values.length - 1].e1rm;
        const prev = t.values[t.values.length - 2].e1rm;
        const dir = last > prev ? 'up' : last < prev ? 'down' : 'stall';
        parts.push(`${t.exercise} e1RM:${dir}`);
      }
    }

    // Volume trend
    if (snap.weeklyVolume.length >= 2) {
      const last = snap.weeklyVolume[snap.weeklyVolume.length - 1].totalVolume;
      const prev = snap.weeklyVolume[snap.weeklyVolume.length - 2].totalVolume;
      const dir = last > prev ? 'up' : last < prev ? 'down' : 'flat';
      parts.push(`Vol:${dir}`);
    }

    // Weight trend — enhanced with rate and direction
    if (snap.weightTrend.length >= 2) {
      const last = snap.weightTrend[snap.weightTrend.length - 1];
      const first = snap.weightTrend[0];
      const delta = Math.round((last.weight - first.weight) * 10) / 10;
      const days = Math.max(1, (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000);
      const weeklyRate = Math.round(((last.weight - first.weight) / days) * 7 * 100) / 100;
      const dir = delta > 0.3 ? 'gaining' : delta < -0.3 ? 'losing' : 'stable';
      parts.push(`Wt:${last.weight}kg(${delta > 0 ? '+' : ''}${delta}kg,${weeklyRate > 0 ? '+' : ''}${weeklyRate}kg/wk,${dir})`);
    }

    // Body fat trend
    if (snap.bodyFatTrend.length >= 2) {
      const bfLast = snap.bodyFatTrend[snap.bodyFatTrend.length - 1].bodyFat;
      const bfFirst = snap.bodyFatTrend[0].bodyFat;
      const bfDelta = Math.round((bfLast - bfFirst) * 10) / 10;
      parts.push(`BF:${bfLast}%(${bfDelta > 0 ? '+' : ''}${bfDelta}%)`);
    }

    // Diet compliance
    parts.push(`Diet:${compliance.compliancePct}%comply`);

    // Avg readiness
    if (snap.readinessTrend.length > 0) {
      const avg = snap.readinessTrend[snap.readinessTrend.length - 1].avgReadiness;
      parts.push(`Ready:${avg}/10`);
    }

    // Cardio
    if (snap.cardioTrend.length > 0) {
      const last = snap.cardioTrend[snap.cardioTrend.length - 1];
      parts.push(`Cardio:${last.totalMinutes}min/${last.sessions}x`);
    }

    return parts.join('; ').slice(0, 500);
  }
}

export const trainingEngine = new TrainingEngine();
