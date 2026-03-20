import {
  ExerciseType, ExerciseSet, WorkoutSession, TrainingPhase,
  BodyPart, SavedExercise, DeloadType,
  EXERCISE_TIER_CONFIG, PHASE_CONFIG,
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
    const reasons: Record<DeloadType, string> = {
      volume: 'High volume fatigue — keep weight, cut sets in half',
      intensity: 'High intensity fatigue — drop weight 15%, keep sets',
      full: 'Overall burnout — reduce weight and volume',
    };
    switch (type) {
      case 'volume':
        return { action: 'DELOAD', weight, reps: `${repMin}-${repMax}`, sets: Math.ceil(sets * 0.5), deloadType: type, reason: reasons[type] };
      case 'intensity':
        return { action: 'DELOAD', weight: Math.round(weight * 0.85 * 10) / 10, reps: `${repMin}-${repMax}`, sets, deloadType: type, reason: reasons[type] };
      case 'full':
      default:
        return { action: 'DELOAD', weight: Math.round(weight * 0.8 * 10) / 10, reps: `${repMin}-${repMax}`, sets: Math.ceil(sets * 0.5), deloadType: type, reason: reasons[type] };
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
}

export const trainingEngine = new TrainingEngine();
