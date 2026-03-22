
import React, { useState, useMemo, useCallback } from 'react';
import {
  WorkoutData, WorkoutSession, Exercise, ExerciseSet, BodyPart, BODY_PARTS,
  DietData, SavedExercise, WorkoutRoutine, TrainingPhase, ExerciseType,
  TrainingCycle, E1RMEntry, TrainingProgram, ProgramDay, IterationLog,
  EXERCISE_TIER_CONFIG, PHASE_CONFIG,
  CardioSession, CardioType, RecoveryScore,
} from '../types';
import { geminiService, STAContext } from '../services/geminiService';
import { trainingEngine } from '../services/trainingEngine';
import {
  X, Plus, Minus, Dumbbell, Trophy, MessageCircle,
  Send, Loader2, ChevronDown, ChevronUp, Trash2,
  Flame, Star, Clock, BarChart3, Zap, Search, Save, BookOpen,
  TrendingUp, AlertTriangle, Target, Calendar, Play, CheckCircle2,
  Heart, Timer, Activity
} from 'lucide-react';

interface WorkoutPanelProps {
  workoutData: WorkoutData;
  dietData: DietData;
  onSave: (data: WorkoutData) => void;
  onWorkoutXP: (xp: number, workoutData?: WorkoutData) => void; // callback to add Health XP
  onClose: () => void;
}

type Tab = 'log' | 'history' | 'cardio' | 'coach';

export const WorkoutPanel: React.FC<WorkoutPanelProps> = ({ workoutData, dietData, onSave, onWorkoutXP, onClose }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('log');

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 400);
  };

  const [sessions, setSessions] = useState<WorkoutSession[]>(workoutData.sessions || []);
  const [exercisePRs, setExercisePRs] = useState<Record<string, number>>(workoutData.exercisePRs || {});

  // Current workout builder
  const [selectedParts, setSelectedParts] = useState<BodyPart[]>([]);
  const [exercises, setExercises] = useState<{ name: string; sets: ExerciseSet[] }[]>([]);
  const [currentExName, setCurrentExName] = useState('');
  const [workoutNotes, setWorkoutNotes] = useState('');
  const [showExerciseForm, setShowExerciseForm] = useState(false);

  // AI Coach
  const [coachQuestion, setCoachQuestion] = useState('');
  const [coachResponse, setCoachResponse] = useState('');
  const [isCoachThinking, setIsCoachThinking] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ q: string; a: string }[]>([]);

  // Saved exercises library & routines
  const [savedExercises, setSavedExercises] = useState<SavedExercise[]>(workoutData.savedExercises || []);
  const [routines, setRoutines] = useState<WorkoutRoutine[]>(workoutData.routines || []);
  const [showSaveRoutine, setShowSaveRoutine] = useState(false);
  const [routineName, setRoutineName] = useState('');

  // STA: Training cycle & phase
  const [currentCycle, setCurrentCycle] = useState<TrainingCycle>(
    workoutData.currentCycle || { week: 1, phase: 'Recomp', accumulatedFatigue: 0 }
  );
  const [exerciseE1RMs, setExerciseE1RMs] = useState<Record<string, E1RMEntry[]>>(workoutData.exerciseE1RMs || {});

  // STA: Exercise types mapping (name -> Primary/Secondary/Isolation)
  const [exerciseTypes, setExerciseTypes] = useState<Record<string, ExerciseType>>(() => {
    const map: Record<string, ExerciseType> = {};
    for (const se of (workoutData.savedExercises || [])) {
      if (se.exerciseType) map[se.name.toLowerCase()] = se.exerciseType;
    }
    return map;
  });

  // Training Program
  const [trainingProgram, setTrainingProgram] = useState<TrainingProgram | undefined>(workoutData.trainingProgram);

  // Program Designer chat
  const [isPlanningMode, setIsPlanningMode] = useState(false);
  const [planChatHistory, setPlanChatHistory] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [pendingProgram, setPendingProgram] = useState<TrainingProgram | undefined>();
  const [iterationNotice, setIterationNotice] = useState<string | null>(null);

  // Cardio state
  const [cardioSessions, setCardioSessions] = useState<CardioSession[]>(workoutData.cardioSessions || []);
  const [showAddCardio, setShowAddCardio] = useState(false);
  const [cardioForm, setCardioForm] = useState<{type: CardioType; activity: string; duration: string; calories: string; avgHR: string; distance: string; rpe: string; notes: string}>({
    type: 'LISS', activity: '', duration: '', calories: '', avgHR: '', distance: '', rpe: '', notes: ''
  });

  // Recovery state
  const [showRecoveryCheck, setShowRecoveryCheck] = useState(false);
  const [recoveryForm, setRecoveryForm] = useState({
    sleepHours: '7', sleepQuality: '7', muscleSoreness: '3', energyLevel: '7', stressLevel: '3'
  });
  const [todayReadiness, setTodayReadiness] = useState<number | null>(null);

  React.useEffect(() => {
    trainingEngine.setPhase(currentCycle.phase);
  }, [currentCycle.phase]);

  const overallFatigue = useMemo(
    () => trainingEngine.getOverallFatigue(sessions),
    [sessions]
  );

  const bodyPartFatigue = useMemo(
    () => trainingEngine.calculateBodyPartFatigue(sessions, savedExercises),
    [sessions, savedExercises]
  );

  const weeklyMuscleSets = useMemo(
    () => trainingEngine.getWeeklyMuscleSetCount(sessions, savedExercises),
    [sessions, savedExercises]
  );

  const staContext: STAContext = useMemo(() => ({
    cycle: currentCycle,
    overallFatigue,
    bodyPartFatigue,
    weeklyMuscleSets,
    exerciseE1RMs,
    exerciseTypes,
  }), [currentCycle, overallFatigue, bodyPartFatigue, weeklyMuscleSets, exerciseE1RMs, exerciseTypes]);

  // Get next uncompleted program day
  const nextProgramDay = useMemo(() => {
    if (!trainingProgram) return null;
    for (const week of trainingProgram.weeks) {
      for (const day of week.days) {
        if (!day.completed) return { week: week.weekNumber, day };
      }
    }
    return null;
  }, [trainingProgram]);

  const programProgress = useMemo(() => {
    if (!trainingProgram) return null;
    const totalDays = trainingProgram.weeks.reduce((s, w) => s + w.days.length, 0);
    const completedDays = trainingProgram.weeks.reduce((s, w) => s + w.days.filter(d => d.completed).length, 0);
    return { totalDays, completedDays, pct: totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0 };
  }, [trainingProgram]);

  // History expanded
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Backfill saved exercises from history on first load
  React.useEffect(() => {
    const existing = new Set((workoutData.savedExercises || []).map(se => se.name.toLowerCase()));
    const backfilled: SavedExercise[] = [];

    for (const session of sessions) {
      for (const ex of session.exercises) {
        const key = ex.name.toLowerCase();
        if (!existing.has(key)) {
          existing.add(key);
          backfilled.push({
            id: `saved-ex-backfill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: ex.name,
            lastWeight: ex.sets[0]?.weight || 0,
            lastUsed: session.timestamp,
          });
        }
      }
    }

    if (backfilled.length > 0) {
      const merged = [...(workoutData.savedExercises || []), ...backfilled];
      setSavedExercises(merged);
      onSave({ ...workoutData, savedExercises: merged });
    }
  }, []);

  // Progress memorizing mechanism
  React.useEffect(() => {
    const saved = localStorage.getItem('workout_progress');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Only load if it's from today to avoid loading very old stale data
        const isToday = new Date(data.timestamp || 0).toDateString() === new Date().toDateString();
        if (isToday && data.exercises && data.exercises.length > 0) {
          setExercises(data.exercises);
          setSelectedParts(data.selectedParts || []);
          setWorkoutNotes(data.notes || '');
        }
      } catch (e) {
        console.error("Failed to load workout progress", e);
      }
    }
  }, []);

  React.useEffect(() => {
    if (exercises.length > 0 || selectedParts.length > 0 || workoutNotes) {
      const data = {
        exercises,
        selectedParts,
        notes: workoutNotes,
        timestamp: Date.now()
      };
      localStorage.setItem('workout_progress', JSON.stringify(data));
    }
  }, [exercises, selectedParts, workoutNotes]);

  const getTodayStr = () => new Date().toISOString().split('T')[0];

  // Toggle body part
  const toggleBodyPart = (part: BodyPart) => {
    setSelectedParts(prev => 
      prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]
    );
  };

  // Add exercise to current workout
  const addExercise = () => {
    if (!currentExName.trim()) return;
    setExercises(prev => [...prev, { name: currentExName.trim(), sets: [{ weight: 0, reps: 0 }] }]);
    setCurrentExName('');
    setShowExerciseForm(false);
  };

  // Add exercise from saved library (with last weight pre-filled)
  const addExerciseFromLibrary = (savedEx: SavedExercise) => {
    setExercises(prev => [...prev, { name: savedEx.name, sets: [{ weight: savedEx.lastWeight, reps: 0 }] }]);
    setCurrentExName('');
    setShowExerciseForm(false);
  };

  // Filter saved exercises for search
  const getFilteredSavedExercises = () => {
    const query = currentExName.toLowerCase().trim();
    const existingNames = exercises.map(e => e.name.toLowerCase());
    return savedExercises
      .filter(se => !existingNames.includes(se.name.toLowerCase()))
      .filter(se => !query || se.name.toLowerCase().includes(query))
      .sort((a, b) => b.lastUsed - a.lastUsed);
  };

  // Save current workout as routine template
  const saveRoutine = () => {
    if (!routineName.trim() || exercises.length === 0) return;
    const routine: WorkoutRoutine = {
      id: `routine-${Date.now()}`,
      name: routineName.trim(),
      bodyParts: [...selectedParts],
      exerciseNames: exercises.map(e => e.name),
      createdAt: Date.now(),
    };
    const newRoutines = [...routines, routine];
    setRoutines(newRoutines);
    setRoutineName('');
    setShowSaveRoutine(false);
    onSave({ sessions, exercisePRs, savedExercises, routines: newRoutines, currentCycle, exerciseE1RMs, trainingProgram });
  };

  // Load a routine template
  const loadRoutine = (routine: WorkoutRoutine) => {
    setSelectedParts(routine.bodyParts);
    const newExercises = routine.exerciseNames.map(name => {
      const saved = savedExercises.find(se => se.name.toLowerCase() === name.toLowerCase());
      return { name, sets: [{ weight: saved?.lastWeight || 0, reps: 0 }] };
    });
    setExercises(newExercises);
  };

  // Delete a routine template
  const deleteRoutine = (id: string) => {
    const newRoutines = routines.filter(r => r.id !== id);
    setRoutines(newRoutines);
    onSave({ sessions, exercisePRs, savedExercises, routines: newRoutines, currentCycle, exerciseE1RMs, trainingProgram });
  };

  // Remove exercise
  const removeExercise = (idx: number) => {
    setExercises(prev => prev.filter((_, i) => i !== idx));
  };

  // Add set to an exercise
  const addSet = (exIdx: number) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const lastSet = ex.sets[ex.sets.length - 1];
      return { ...ex, sets: [...ex.sets, { weight: lastSet?.weight || 0, reps: lastSet?.reps || 0 }] };
    }));
  };

  // Remove set from exercise
  const removeSet = (exIdx: number, setIdx: number) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx || ex.sets.length <= 1) return ex;
      return { ...ex, sets: ex.sets.filter((_, si) => si !== setIdx) };
    }));
  };

  // Update set values
  const updateSet = (exIdx: number, setIdx: number, field: 'weight' | 'reps' | 'rpe', value: number) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      return { ...ex, sets: ex.sets.map((s, si) => si === setIdx ? { ...s, [field]: value } : s) };
    }));
  };

  // STA: Toggle exercise type
  const toggleExerciseType = (exerciseName: string) => {
    const key = exerciseName.toLowerCase();
    const order: ExerciseType[] = ['Primary', 'Secondary', 'Isolation'];
    setExerciseTypes(prev => {
      const current = prev[key] || 'Primary';
      const idx = order.indexOf(current);
      return { ...prev, [key]: order[(idx + 1) % order.length] };
    });
  };

  const getSuggestion = (exerciseName: string) => {
    const exType = exerciseTypes[exerciseName.toLowerCase()] || 'Primary';
    const history = trainingEngine.getLastExerciseHistory(exerciseName, sessions, overallFatigue);
    if (!history) return null;
    return trainingEngine.getNextStep(exType, history);
  };

  // Complete workout session
  const completeWorkout = async () => {
    if (exercises.length === 0 || selectedParts.length === 0) return;

    const newPRs = { ...exercisePRs };
    const newE1RMs = { ...exerciseE1RMs };
    const todayStr = getTodayStr();
    let totalXP = 0;

    const completedExercises: Exercise[] = exercises.map((ex, i) => {
      const totalVolume = ex.sets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
      const bestE1RM = trainingEngine.getBestE1RM(ex.sets);
      const key = ex.name.toLowerCase();
      const prevBestE1RM = newPRs[key] || 0;
      const isPR = bestE1RM > prevBestE1RM && prevBestE1RM > 0;

      const baseXP = ex.sets.length;
      const exerciseXP = isPR ? Math.round(baseXP * 1.5) : baseXP;
      totalXP += exerciseXP;

      if (bestE1RM > prevBestE1RM) {
        newPRs[key] = bestE1RM;
      }

      if (bestE1RM > 0) {
        const history = newE1RMs[key] || [];
        history.push({ date: todayStr, e1rm: bestE1RM });
        newE1RMs[key] = history.slice(-50);
      }

      return {
        id: `ex-${Date.now()}-${i}`,
        name: ex.name,
        sets: ex.sets,
        totalVolume,
        xpEarned: exerciseXP,
        isPR,
      };
    });

    const session: WorkoutSession = {
      id: `ws-${Date.now()}`,
      date: todayStr,
      timestamp: Date.now(),
      bodyParts: selectedParts,
      exercises: completedExercises,
      totalSets: completedExercises.reduce((s, e) => s + e.sets.length, 0),
      totalXP,
      notes: workoutNotes || undefined,
    };

    const newSessions = [session, ...sessions];
    setSessions(newSessions);
    setExercisePRs(newPRs);
    setExerciseE1RMs(newE1RMs);

    const newFatigue = trainingEngine.getOverallFatigue(newSessions);
    const updatedCycle = { ...currentCycle, accumulatedFatigue: newFatigue };
    setCurrentCycle(updatedCycle);

    const newSavedExercises = [...savedExercises];
    exercises.forEach(ex => {
      const idx = newSavedExercises.findIndex(se => se.name.toLowerCase() === ex.name.toLowerCase());
      const firstSetWeight = ex.sets[0]?.weight || 0;
      const exType = exerciseTypes[ex.name.toLowerCase()];
      if (idx >= 0) {
        newSavedExercises[idx] = {
          ...newSavedExercises[idx],
          lastWeight: firstSetWeight,
          lastUsed: Date.now(),
          exerciseType: exType || newSavedExercises[idx].exerciseType,
        };
      } else {
        newSavedExercises.push({
          id: `saved-ex-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: ex.name,
          lastWeight: firstSetWeight,
          lastUsed: Date.now(),
          exerciseType: exType,
        });
      }
    });
    setSavedExercises(newSavedExercises);

    let updatedProgram = trainingProgram;

    if (trainingProgram && nextProgramDay) {
      const dayToMark = nextProgramDay.day;
      const newWeeks = trainingProgram.weeks.map(w => ({
        ...w,
        days: w.days.map(d =>
          d.dayNumber === dayToMark.dayNumber && w.weekNumber === nextProgramDay.week
            ? { ...d, completed: true, completedSessionId: session.id, completedAt: Date.now() }
            : d
        ),
      }));

      const nextWeek = nextProgramDay.week;
      const dayIdx = newWeeks[nextWeek - 1]?.days.findIndex(d => !d.completed) ?? -1;
      const newCurrentDayInWeek = dayIdx >= 0 ? dayIdx + 1 : 1;
      const allDaysInWeekDone = newWeeks[nextWeek - 1]?.days.every(d => d.completed);
      const newCurrentWeek = allDaysInWeekDone ? Math.min(nextWeek + 1, trainingProgram.totalWeeks) : nextWeek;

      updatedProgram = {
        ...trainingProgram,
        weeks: newWeeks,
        currentWeek: newCurrentWeek,
        currentDayInWeek: newCurrentDayInWeek,
      };
      setTrainingProgram(updatedProgram);

      // Trigger async iteration in background
      const iterCtx: STAContext = {
        cycle: updatedCycle,
        overallFatigue: newFatigue,
        bodyPartFatigue: trainingEngine.calculateBodyPartFatigue(newSessions, newSavedExercises),
        weeklyMuscleSets: trainingEngine.getWeeklyMuscleSetCount(newSessions, newSavedExercises),
        exerciseE1RMs: newE1RMs,
        exerciseTypes,
      };
      const aiCtx = trainingEngine.buildAIContext(workoutData, dietData);
      geminiService.iterateProgram(updatedProgram, session, dayToMark, iterCtx, aiCtx).then(result => {
        setTrainingProgram(result.updatedProgram);
        setIterationNotice(result.summary);
        const newLog: IterationLog = {
          id: `iter_${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          timestamp: Date.now(),
          sessionId: session.id,
          summary: result.summary,
          weekNumber: trainingProgram.currentWeek,
          dayNumber: trainingProgram.currentDayInWeek,
        };
        const updatedLogs = [...(workoutData.iterationLogs || []), newLog];
        const iterData: WorkoutData = {
          sessions: newSessions,
          exercisePRs: newPRs,
          savedExercises: newSavedExercises,
          routines,
          currentCycle: updatedCycle,
          exerciseE1RMs: newE1RMs,
          trainingProgram: result.updatedProgram,
          iterationLogs: updatedLogs,
        };
        onSave(iterData);
        setTimeout(() => setIterationNotice(null), 10000);
      }).catch(err => console.error('Iteration failed:', err));
    }

    const newData: WorkoutData = {
      sessions: newSessions,
      exercisePRs: newPRs,
      savedExercises: newSavedExercises,
      routines,
      currentCycle: updatedCycle,
      exerciseE1RMs: newE1RMs,
      trainingProgram: updatedProgram,
    };
    onSave(newData);
    onWorkoutXP(totalXP, newData);

    setSelectedParts([]);
    setExercises([]);
    setWorkoutNotes('');
    localStorage.removeItem('workout_progress');
  };

  const askCoach = async () => {
    if (!coachQuestion.trim()) return;
    setIsCoachThinking(true);
    try {
      const aiCtx = trainingEngine.buildAIContext(workoutData, dietData);
      const answer = await geminiService.workoutCoachAdvice(
        coachQuestion, sessions, dietData, staContext, aiCtx
      );
      setChatHistory(prev => [...prev, { q: coachQuestion, a: answer }]);
      setCoachResponse(answer);
      setCoachQuestion('');
    } catch (e) {
      setCoachResponse('Sorry, the coach is unavailable right now.');
    } finally {
      setIsCoachThinking(false);
    }
  };

  // Program Designer conversation
  const askProgramDesigner = async (userMsg: string) => {
    if (!userMsg.trim()) return;
    setIsCoachThinking(true);
    const newHistory = [...planChatHistory, { role: 'user' as const, text: userMsg }];
    setPlanChatHistory(newHistory);
    try {
      const result = await geminiService.programDesignerChat(
        newHistory, sessions, dietData, staContext
      );
      setPlanChatHistory(prev => [...prev, { role: 'assistant' as const, text: result.text }]);
      if (result.program) {
        setPendingProgram(result.program);
      }
    } catch (e) {
      setPlanChatHistory(prev => [...prev, { role: 'assistant' as const, text: 'Designer unavailable.' }]);
    } finally {
      setIsCoachThinking(false);
    }
  };

  const saveProgram = (prog: TrainingProgram) => {
    setTrainingProgram(prog);
    setPendingProgram(undefined);
    setIsPlanningMode(false);
    setPlanChatHistory([]);
    const newData: WorkoutData = {
      sessions, exercisePRs, savedExercises, routines,
      currentCycle, exerciseE1RMs, trainingProgram: prog,
    };
    onSave(newData);
  };

  const loadPlanToday = () => {
    if (!nextProgramDay) return;
    const plan = nextProgramDay.day;
    setSelectedParts(plan.bodyParts);
    setExercises(plan.exercises.map((pe, i) => ({
      name: pe.name,
      sets: Array.from({ length: pe.targetSets }, () => ({
        weight: pe.targetWeight || 0,
        reps: 0,
        rpe: undefined,
        targetWeight: pe.targetWeight,
        targetReps: pe.targetReps,
        targetRPE: pe.targetRPE,
      })),
    })));
    setActiveTab('log');
  };

  const handleAddCardio = () => {
    const session: CardioSession = {
      id: `cardio_${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      timestamp: Date.now(),
      type: cardioForm.type,
      activity: cardioForm.activity || cardioForm.type,
      durationMinutes: parseInt(cardioForm.duration) || 0,
      caloriesBurned: cardioForm.calories ? parseInt(cardioForm.calories) : undefined,
      avgHeartRate: cardioForm.avgHR ? parseInt(cardioForm.avgHR) : undefined,
      distanceKm: cardioForm.distance ? parseFloat(cardioForm.distance) : undefined,
      rpe: cardioForm.rpe ? parseInt(cardioForm.rpe) : undefined,
      notes: cardioForm.notes || undefined,
    };
    const updated = [...cardioSessions, session];
    setCardioSessions(updated);
    onSave({ ...workoutData, cardioSessions: updated });
    setShowAddCardio(false);
    setCardioForm({ type: 'LISS', activity: '', duration: '', calories: '', avgHR: '', distance: '', rpe: '', notes: '' });
  };

  const handleRecoverySubmit = () => {
    const sleepHours = parseFloat(recoveryForm.sleepHours) || 7;
    const sleepQuality = parseInt(recoveryForm.sleepQuality) || 7;
    const muscleSoreness = parseInt(recoveryForm.muscleSoreness) || 3;
    const energyLevel = parseInt(recoveryForm.energyLevel) || 7;
    const stressLevel = parseInt(recoveryForm.stressLevel) || 3;
    const readiness = Math.round(((sleepQuality * 0.3) + (energyLevel * 0.25) + ((10 - muscleSoreness) * 0.25) + ((10 - stressLevel) * 0.2)) * 10) / 10;
    const score: RecoveryScore = {
      id: `rec_${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      timestamp: Date.now(),
      sleepHours, sleepQuality, muscleSoreness, energyLevel, stressLevel,
      overallReadiness: readiness,
    };
    const updated = [...(workoutData.recoveryScores || []), score];
    setTodayReadiness(readiness);
    onSave({ ...workoutData, recoveryScores: updated });
    setShowRecoveryCheck(false);
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'log', label: 'WORKOUT', icon: <Dumbbell size={14} /> },
    { key: 'history', label: 'HISTORY', icon: <BarChart3 size={14} /> },
    { key: 'cardio', label: 'CARDIO', icon: <Activity size={14} /> },
    { key: 'coach', label: 'AI COACH', icon: <MessageCircle size={14} /> },
  ];

  return (
    <div className={`fixed inset-0 bg-black/90 backdrop-blur-md z-[600] flex flex-col ${isClosing ? 'tv-screen-off' : 'tv-screen-on'}`} style={{ filter: 'brightness(1.15)', paddingTop: 'max(env(safe-area-inset-top), 48px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Dumbbell size={22} className="text-rose-400" />
          <h2 className="font-game text-xl text-white">WORKOUT LOG</h2>
        </div>
        <button onClick={handleClose} className="text-slate-500 hover:text-white transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 flex items-center justify-center gap-1.5 text-xs font-game tracking-wider transition-all ${
              activeTab === tab.key
                ? 'text-rose-400 border-b-2 border-rose-400 bg-rose-500/5'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ===== LOG TAB ===== */}
        {activeTab === 'log' && (
          <div className="space-y-4">
            {/* Recovery Readiness Banner */}
            {todayReadiness === null ? (
              <button
                onClick={() => setShowRecoveryCheck(true)}
                className="w-full bg-violet-600/15 border border-violet-500/30 rounded-2xl py-3 px-4 flex items-center justify-center gap-2 text-violet-400 font-game text-sm hover:bg-violet-600/25 transition-all"
              >
                <Heart size={16} /> CHECK READINESS
              </button>
            ) : (
              <div className={`rounded-2xl py-3 px-4 flex items-center gap-3 border ${
                todayReadiness >= 7 ? 'bg-green-500/10 border-green-500/30' :
                todayReadiness >= 5 ? 'bg-yellow-500/10 border-yellow-500/30' :
                'bg-red-500/10 border-red-500/30'
              }`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                  todayReadiness >= 7 ? 'bg-green-500/20 text-green-400' :
                  todayReadiness >= 5 ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {todayReadiness}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-white">Readiness Score</div>
                  <div className={`text-xs ${
                    todayReadiness >= 7 ? 'text-green-400' :
                    todayReadiness >= 5 ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>
                    {todayReadiness >= 7 ? 'Go hard — push for PRs today' :
                     todayReadiness >= 5 ? 'Moderate intensity recommended' :
                     'Consider a light day or active recovery'}
                  </div>
                </div>
              </div>
            )}

            {/* Recovery Check Modal */}
            {showRecoveryCheck && (
              <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 space-y-4">
                <h3 className="font-game text-sm text-violet-400 flex items-center gap-2"><Heart size={14} /> RECOVERY CHECK</h3>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Sleep Hours</label>
                  <input type="number" step="0.5" min="0" max="14" value={recoveryForm.sleepHours} onChange={e => setRecoveryForm(f => ({...f, sleepHours: e.target.value}))} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1.5 block">Sleep Quality (1-10)</label>
                  <div className="flex gap-1">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button key={n} onClick={() => setRecoveryForm(f => ({...f, sleepQuality: String(n)}))}
                        className={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${parseInt(recoveryForm.sleepQuality) === n ? 'bg-violet-500/30 text-violet-300 border border-violet-500/40' : 'bg-slate-800 text-slate-500 border border-white/5'}`}
                      >{n}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1.5 block">Muscle Soreness (1=none, 10=extreme)</label>
                  <div className="flex gap-1">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button key={n} onClick={() => setRecoveryForm(f => ({...f, muscleSoreness: String(n)}))}
                        className={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${parseInt(recoveryForm.muscleSoreness) === n ? 'bg-orange-500/30 text-orange-300 border border-orange-500/40' : 'bg-slate-800 text-slate-500 border border-white/5'}`}
                      >{n}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1.5 block">Energy Level (1-10)</label>
                  <div className="flex gap-1">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button key={n} onClick={() => setRecoveryForm(f => ({...f, energyLevel: String(n)}))}
                        className={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${parseInt(recoveryForm.energyLevel) === n ? 'bg-green-500/30 text-green-300 border border-green-500/40' : 'bg-slate-800 text-slate-500 border border-white/5'}`}
                      >{n}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1.5 block">Stress Level (1=calm, 10=overwhelmed)</label>
                  <div className="flex gap-1">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button key={n} onClick={() => setRecoveryForm(f => ({...f, stressLevel: String(n)}))}
                        className={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${parseInt(recoveryForm.stressLevel) === n ? 'bg-red-500/30 text-red-300 border border-red-500/40' : 'bg-slate-800 text-slate-500 border border-white/5'}`}
                      >{n}</button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowRecoveryCheck(false)} className="flex-1 py-2 rounded-xl text-sm font-bold border border-white/20 text-slate-400">Cancel</button>
                  <button onClick={handleRecoverySubmit} className="flex-1 py-2 rounded-xl text-sm font-bold bg-violet-600 text-white">Submit</button>
                </div>
              </div>
            )}

            {/* Iteration Notification */}
            {iterationNotice && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 flex items-start gap-2">
                <TrendingUp size={16} className="text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-amber-300">Program Updated</p>
                  <p className="text-xs text-amber-200/80 mt-0.5">{iterationNotice}</p>
                </div>
                <button onClick={() => setIterationNotice(null)} className="ml-auto text-amber-500/50 hover:text-amber-400">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Today's Plan Card */}
            {trainingProgram && nextProgramDay && (
              <div className="bg-slate-900/60 border border-violet-500/20 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-game text-sm text-violet-400 flex items-center gap-1.5">
                    <Calendar size={14} /> TODAY'S PLAN
                  </h3>
                  <span className="text-xs text-slate-500">
                    Week {nextProgramDay.week} — {nextProgramDay.day.label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {nextProgramDay.day.bodyParts.map(bp => (
                    <span key={bp} className="text-xs bg-violet-500/10 border border-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full">
                      {BODY_PARTS.find(b => b.key === bp)?.emoji} {bp}
                    </span>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {nextProgramDay.day.exercises.map((pe, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-slate-300 bg-slate-800/40 rounded-lg px-3 py-1.5">
                      <span className="font-medium">{pe.name}</span>
                      <span className="text-slate-500">
                        {pe.targetSets}s x {pe.targetReps} @RPE{pe.targetRPE}
                        {pe.targetWeight ? ` ${pe.targetWeight}kg` : ''}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={loadPlanToday}
                  className="w-full py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Play size={14} /> Load This Plan
                </button>
              </div>
            )}

            {/* Body Part Tags */}
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-3">
              <h3 className="font-game text-base text-rose-400">BODY PARTS</h3>
              <div className="flex flex-wrap gap-2">
                {BODY_PARTS.map(bp => (
                  <button
                    key={bp.key}
                    onClick={() => toggleBodyPart(bp.key)}
                    className={`px-3 py-2 rounded-xl text-sm font-bold border transition-all ${
                      selectedParts.includes(bp.key)
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                        : 'bg-slate-900/60 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {bp.emoji} {bp.label}
                  </button>
                ))}
              </div>
            </div>

            {/* STA: Phase Selector & Fatigue */}
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-game text-base text-rose-400 flex items-center gap-1.5">
                  <Target size={16} /> TRAINING PHASE
                </h3>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500">Fatigue:</span>
                  <span className={`font-bold ${overallFatigue > 7 ? 'text-red-400' : overallFatigue > 4 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                    {overallFatigue.toFixed(1)}/10
                  </span>
                  {overallFatigue > 7 && <AlertTriangle size={12} className="text-red-400" />}
                </div>
              </div>
              <div className="flex gap-2">
                {(['Bulk', 'Cut', 'Recomp'] as TrainingPhase[]).map(phase => (
                  <button
                    key={phase}
                    onClick={() => setCurrentCycle(prev => ({ ...prev, phase }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${
                      currentCycle.phase === phase
                        ? phase === 'Bulk' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : phase === 'Cut' ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                          : 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                        : 'bg-slate-900/60 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {phase}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>Week {currentCycle.week}</span>
                <button
                  onClick={() => setCurrentCycle(prev => ({ ...prev, week: prev.week + 1 }))}
                  className="text-slate-400 hover:text-white underline"
                >+1 week</button>
                <button
                  onClick={() => setCurrentCycle(prev => ({ ...prev, week: Math.max(1, prev.week - 1) }))}
                  className="text-slate-400 hover:text-white underline"
                >-1 week</button>
              </div>
            </div>

            {/* Routines */}
            {(routines.length > 0 || (exercises.length > 0 && selectedParts.length > 0)) && (
              <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-game text-base text-rose-400 flex items-center gap-1.5">
                    <BookOpen size={16} /> ROUTINES
                  </h3>
                  {exercises.length > 0 && selectedParts.length > 0 && (
                    <button
                      onClick={() => setShowSaveRoutine(!showSaveRoutine)}
                      className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors"
                    >
                      <Save size={12} /> Save Current
                    </button>
                  )}
                </div>

                {showSaveRoutine && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={routineName}
                      onChange={(e) => setRoutineName(e.target.value)}
                      placeholder="Routine name (e.g. Push Day)"
                      className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ring-rose-500/50 placeholder:text-slate-500"
                      onKeyDown={(e) => e.key === 'Enter' && saveRoutine()}
                      autoFocus
                    />
                    <button
                      onClick={saveRoutine}
                      disabled={!routineName.trim()}
                      className="px-4 py-2 bg-rose-600 text-white text-sm font-bold rounded-xl hover:bg-rose-500 disabled:opacity-50"
                    >
                      SAVE
                    </button>
                  </div>
                )}

                {routines.length > 0 && (
                  <div className="space-y-2">
                    {routines.map(r => (
                      <div
                        key={r.id}
                        className="flex items-center gap-2 bg-slate-800/40 hover:bg-slate-700/60 rounded-xl px-3 py-2.5 transition-all group"
                      >
                        <button
                          onClick={() => loadRoutine(r)}
                          className="flex-1 text-left"
                        >
                          <div className="text-sm font-bold text-slate-200 group-hover:text-white">{r.name}</div>
                          <div className="text-xs text-slate-500">
                            {r.bodyParts.map(p => BODY_PARTS.find(bp => bp.key === p)?.label).join(', ')} · {r.exerciseNames.length} exercises
                          </div>
                        </button>
                        <button
                          onClick={() => deleteRoutine(r.id)}
                          className="text-slate-600 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Exercises List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-game text-base text-rose-400">EXERCISES ({exercises.length})</h3>
              </div>

              {exercises.map((ex, exIdx) => {
                const prevBest = exercisePRs[ex.name.toLowerCase()] || 0;
                const currentVolume = ex.sets.reduce((s, set) => s + (set.weight * set.reps), 0);
                const isPR = currentVolume > prevBest && prevBest > 0;
                const exType = exerciseTypes[ex.name.toLowerCase()] || 'Primary';
                const bestE1RM = trainingEngine.getBestE1RM(ex.sets);
                const suggestion = getSuggestion(ex.name);

                return (
                  <div key={exIdx} className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Dumbbell size={16} className="text-rose-400" />
                        <span className="font-bold text-white text-base">{ex.name}</span>
                        {isPR && (
                          <span className="bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-xs px-2 py-0.5 rounded-full font-game flex items-center gap-1">
                            <Trophy size={10} /> PR!
                          </span>
                        )}
                        <button
                          onClick={() => toggleExerciseType(ex.name)}
                          className={`text-xs px-2 py-0.5 rounded-full border font-bold transition-all ${
                            exType === 'Primary'
                              ? 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                              : exType === 'Secondary'
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                              : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                          }`}
                        >
                          {EXERCISE_TIER_CONFIG[exType].label} ({EXERCISE_TIER_CONFIG[exType].repRange.join('-')})
                        </button>
                      </div>
                      <button onClick={() => removeExercise(exIdx)} className="text-slate-600 hover:text-red-400 p-1">
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Volume + e1RM info */}
                    <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                      <span>Volume: <span className={`font-bold ${isPR ? 'text-yellow-400' : 'text-white'}`}>{currentVolume}</span></span>
                      {prevBest > 0 && <span>Best: <span className="text-slate-300">{prevBest}</span></span>}
                      <span>Sets: <span className="text-white font-bold">{ex.sets.length}</span></span>
                      {bestE1RM > 0 && (
                        <span className="flex items-center gap-0.5">
                          <TrendingUp size={10} className="text-sky-400" />
                          e1RM: <span className="text-sky-400 font-bold">{bestE1RM}kg</span>
                        </span>
                      )}
                    </div>

                    {/* STA: Next session suggestion */}
                    {suggestion && (
                      <div className={`rounded-lg px-3 py-2 text-xs border ${
                        suggestion.action === 'DELOAD'
                          ? 'bg-red-500/10 border-red-500/20 text-red-300'
                          : suggestion.action === 'INCREASE_WEIGHT'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                          : suggestion.action === 'INCREASE_REPS'
                          ? 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                          : 'bg-slate-800/60 border-white/5 text-slate-400'
                      }`}>
                        <span className="font-bold">{suggestion.action}:</span>{' '}
                        {suggestion.weight}kg x {suggestion.reps} reps
                        {suggestion.sets != null && ` (${suggestion.sets} sets)`}
                        <span className="text-slate-500 ml-1">— {suggestion.reason}</span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="grid grid-cols-[28px_1fr_1fr_52px_28px] gap-1.5 items-center text-xs text-slate-500 font-game px-1">
                        <span className="text-center">#</span>
                        <span>WEIGHT</span>
                        <span>REPS</span>
                        <span className="text-center">RPE</span>
                        <span></span>
                      </div>
                      {ex.sets.map((set, setIdx) => (
                        <div key={setIdx} className="grid grid-cols-[28px_1fr_1fr_52px_28px] gap-1.5 items-center">
                          <span className="text-xs text-slate-500 font-bold text-center">{setIdx + 1}</span>
                          <input
                            type="number"
                            value={set.weight || ''}
                            onChange={(e) => updateSet(exIdx, setIdx, 'weight', parseFloat(e.target.value) || 0)}
                            placeholder="kg"
                            className="bg-slate-950 border border-white/10 rounded-lg px-2 py-2 text-white text-sm w-full focus:outline-none focus:ring-1 ring-rose-500/50 placeholder:text-slate-600"
                          />
                          <input
                            type="number"
                            value={set.reps || ''}
                            onChange={(e) => updateSet(exIdx, setIdx, 'reps', parseInt(e.target.value) || 0)}
                            placeholder="0"
                            className="bg-slate-950 border border-white/10 rounded-lg px-2 py-2 text-white text-sm w-full focus:outline-none focus:ring-1 ring-rose-500/50 placeholder:text-slate-600"
                          />
                          <input
                            type="number"
                            value={set.rpe || ''}
                            onChange={(e) => updateSet(exIdx, setIdx, 'rpe', Math.min(10, Math.max(0, parseFloat(e.target.value) || 0)))}
                            placeholder="RPE"
                            min={1}
                            max={10}
                            className="bg-slate-950 border border-white/10 rounded-lg px-1 py-2 text-amber-300 text-sm text-center w-full focus:outline-none focus:ring-1 ring-amber-500/50 placeholder:text-slate-600"
                          />
                          <button
                            onClick={() => removeSet(exIdx, setIdx)}
                            className="text-slate-600 hover:text-red-400 p-1 flex justify-center"
                            disabled={ex.sets.length <= 1}
                          >
                            <Minus size={14} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => addSet(exIdx)}
                      className="w-full bg-slate-800/60 text-slate-400 text-xs font-bold py-2 rounded-lg hover:bg-slate-700 hover:text-white transition-all flex items-center justify-center gap-1"
                    >
                      <Plus size={12} /> ADD SET
                    </button>
                  </div>
                );
              })}

              {/* Add Exercise */}
              {showExerciseForm ? (
                <div className="bg-slate-900/60 border border-rose-500/20 rounded-2xl p-4 space-y-3">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={currentExName}
                      onChange={(e) => setCurrentExName(e.target.value)}
                      placeholder="Search or add exercise..."
                      className="w-full bg-slate-950 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none focus:ring-1 ring-rose-500/50 placeholder:text-slate-500"
                      onKeyDown={(e) => e.key === 'Enter' && addExercise()}
                      autoFocus
                    />
                  </div>

                  {getFilteredSavedExercises().length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      <div className="text-xs text-slate-500 font-game px-1 mb-1">SAVED EXERCISES</div>
                      {getFilteredSavedExercises().slice(0, 8).map(se => (
                        <button
                          key={se.id}
                          onClick={() => addExerciseFromLibrary(se)}
                          className="w-full flex items-center justify-between bg-slate-800/60 hover:bg-slate-700/80 rounded-xl px-3 py-2.5 transition-all group"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-slate-200 group-hover:text-white">{se.name}</span>
                            {se.exerciseType && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                se.exerciseType === 'Compound' ? 'text-violet-400 bg-violet-500/10' : 'text-cyan-400 bg-cyan-500/10'
                              }`}>{se.exerciseType === 'Compound' ? 'C' : 'I'}</span>
                            )}
                          </div>
                          {se.lastWeight > 0 && (
                            <span className="text-xs text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded-lg">
                              {se.lastWeight}kg
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => { setShowExerciseForm(false); setCurrentExName(''); }} className="flex-1 bg-slate-800 text-slate-400 font-bold py-2.5 rounded-xl text-sm hover:bg-slate-700">CANCEL</button>
                    <button onClick={addExercise} disabled={!currentExName.trim()} className="flex-1 bg-rose-600 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-rose-500 disabled:opacity-50">ADD NEW</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowExerciseForm(true)}
                  className="w-full bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-center justify-center gap-2 text-rose-400 font-bold hover:bg-rose-500/20 transition-all"
                >
                  <Plus size={18} /> ADD EXERCISE
                </button>
              )}
            </div>

            {/* Notes */}
            <input
              type="text"
              value={workoutNotes}
              onChange={(e) => setWorkoutNotes(e.target.value)}
              placeholder="Workout notes (optional)"
              className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-1 ring-rose-500/50 placeholder:text-slate-500"
            />

            {/* Complete Workout */}
            <div className="space-y-2">
              {exercises.length > 0 && selectedParts.length > 0 && (
                <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Total sets: <span className="text-white font-bold">{exercises.reduce((s, e) => s + e.sets.length, 0)}</span></span>
                  <span className="text-xs text-slate-400">Est. XP: <span className="text-emerald-400 font-bold">
                    +{exercises.reduce((total, ex) => {
                      const vol = ex.sets.reduce((s, set) => s + (set.weight * set.reps), 0);
                      const prev = exercisePRs[ex.name.toLowerCase()] || 0;
                      const isPR = vol > prev && prev > 0;
                      return total + (isPR ? Math.round(ex.sets.length * 1.5) : ex.sets.length);
                    }, 0)} Health XP
                  </span></span>
                </div>
              )}

              <button
                onClick={completeWorkout}
                disabled={exercises.length === 0 || selectedParts.length === 0}
                className="w-full bg-rose-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-rose-500 transition-all shadow-[0_0_20px_rgba(244,63,94,0.3)] disabled:opacity-50 text-base"
              >
                <Flame size={20} /> COMPLETE WORKOUT
              </button>
            </div>
          </div>
        )}

        {/* ===== HISTORY TAB ===== */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {/* AI Iteration Logs */}
            {(workoutData.iterationLogs?.length ?? 0) > 0 && (
              <div className="bg-slate-900/60 border border-violet-500/20 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpandedSession(expandedSession === 'ai-logs' ? null : 'ai-logs')}
                  className="w-full p-4 flex items-center gap-3 hover:bg-slate-800/40 transition-all"
                >
                  <div className="w-10 h-10 bg-violet-500/10 border border-violet-500/20 rounded-full flex items-center justify-center text-violet-400">
                    <Zap size={18} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-bold text-white text-sm">AI Analysis History</div>
                    <div className="text-xs text-slate-400">{workoutData.iterationLogs!.length} iterations</div>
                  </div>
                  {expandedSession === 'ai-logs' ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                </button>
                {expandedSession === 'ai-logs' && (
                  <div className="px-4 pb-4 space-y-2 border-t border-white/5 pt-3 max-h-64 overflow-y-auto">
                    {[...workoutData.iterationLogs!].reverse().map(log => (
                      <div key={log.id} className="bg-slate-950/60 rounded-xl p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-violet-400 font-bold">W{log.weekNumber} D{log.dayNumber}</span>
                          <span className="text-xs text-slate-500">{log.date}</span>
                        </div>
                        <p className="text-sm text-slate-300">{log.summary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {sessions.length > 0 ? sessions.map(session => {
              const isExpanded = expandedSession === session.id;
              return (
                <div key={session.id} className="bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpandedSession(isExpanded ? null : session.id)}
                    className="w-full p-4 flex items-center gap-3 hover:bg-slate-800/40 transition-all"
                  >
                    <div className="w-10 h-10 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center text-rose-400">
                      <Dumbbell size={18} />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-bold text-white text-sm">{session.bodyParts.map(p => BODY_PARTS.find(bp => bp.key === p)?.label).join(', ')}</div>
                      <div className="text-xs text-slate-400">
                        {session.date} | {session.exercises.length} exercises, {session.totalSets} sets
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-emerald-400">+{session.totalXP} XP</div>
                      {session.exercises.some(e => e.isPR) && (
                        <div className="text-xs text-yellow-400 flex items-center gap-0.5 justify-end"><Trophy size={10} /> PR</div>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp size={16} className="text-slate-500 shrink-0" /> : <ChevronDown size={16} className="text-slate-500 shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                      {session.exercises.map(ex => {
                        const histE1RM = trainingEngine.getBestE1RM(ex.sets);
                        return (
                          <div key={ex.id} className="bg-slate-950/60 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-white flex items-center gap-1.5">
                                {ex.name}
                                {ex.isPR && <Star size={12} className="text-yellow-400" />}
                              </span>
                              <span className="text-xs text-emerald-400 font-bold">+{ex.xpEarned} XP</span>
                            </div>
                            <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                              <span>Volume: {ex.totalVolume}</span>
                              <span>{ex.sets.length} sets</span>
                              {histE1RM > 0 && (
                                <span className="flex items-center gap-0.5 text-sky-400">
                                  <TrendingUp size={10} /> e1RM: {histE1RM}kg
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {ex.sets.map((s, si) => (
                                <span key={si} className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded-lg">
                                  {s.weight}kg × {s.reps}
                                  {s.rpe != null && s.rpe > 0 && (
                                    <span className="text-amber-400 ml-1">@{s.rpe}</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {session.notes && (
                        <div className="text-xs text-slate-400 italic">📝 {session.notes}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            }) : (
              <div className="text-center py-16 text-slate-500 space-y-3">
                <Dumbbell size={48} className="mx-auto opacity-30" />
                <p className="font-game text-lg">NO WORKOUTS YET</p>
                <p className="text-sm text-slate-400">Log your first workout to start tracking</p>
              </div>
            )}
          </div>
        )}

        {/* ===== CARDIO TAB ===== */}
        {activeTab === 'cardio' && (
          <div className="space-y-4">
            {/* Add Cardio Button */}
            <button onClick={() => setShowAddCardio(true)} className="w-full bg-cyan-600/20 border border-cyan-500/40 rounded-2xl py-3 flex items-center justify-center gap-2 text-cyan-400 font-game hover:bg-cyan-600/30">
              <Plus size={16} /> LOG CARDIO SESSION
            </button>

            {/* Add Cardio Form */}
            {showAddCardio && (
              <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 space-y-3">
                {/* Type selector: LISS | HIIT | Conditioning | Sport */}
                <div className="grid grid-cols-4 gap-1.5">
                  {(['LISS','HIIT','Conditioning','Sport'] as CardioType[]).map(t => (
                    <button key={t} onClick={() => setCardioForm(f => ({...f, type: t}))}
                      className={`py-2 rounded-lg text-xs font-bold transition-all ${cardioForm.type === t ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-slate-800 text-slate-400 border border-white/5'}`}
                    >{t}</button>
                  ))}
                </div>
                {/* Activity name */}
                <input placeholder="Activity (e.g. Treadmill, Cycling)" value={cardioForm.activity} onChange={e => setCardioForm(f => ({...f, activity: e.target.value}))} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                {/* Duration + Calories row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Duration (min)</label>
                    <input type="number" placeholder="30" value={cardioForm.duration} onChange={e => setCardioForm(f => ({...f, duration: e.target.value}))} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Calories</label>
                    <input type="number" placeholder="250" value={cardioForm.calories} onChange={e => setCardioForm(f => ({...f, calories: e.target.value}))} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                  </div>
                </div>
                {/* HR + Distance + RPE row */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Avg HR</label>
                    <input type="number" placeholder="140" value={cardioForm.avgHR} onChange={e => setCardioForm(f => ({...f, avgHR: e.target.value}))} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Dist (km)</label>
                    <input type="number" step="0.1" placeholder="5.0" value={cardioForm.distance} onChange={e => setCardioForm(f => ({...f, distance: e.target.value}))} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">RPE</label>
                    <input type="number" min="1" max="10" placeholder="6" value={cardioForm.rpe} onChange={e => setCardioForm(f => ({...f, rpe: e.target.value}))} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                  </div>
                </div>
                {/* Notes */}
                <input placeholder="Notes (optional)" value={cardioForm.notes} onChange={e => setCardioForm(f => ({...f, notes: e.target.value}))} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                {/* Buttons */}
                <div className="flex gap-2">
                  <button onClick={() => setShowAddCardio(false)} className="flex-1 py-2 rounded-xl text-sm font-bold border border-white/20 text-slate-400">Cancel</button>
                  <button onClick={handleAddCardio} disabled={!cardioForm.duration} className="flex-1 py-2 rounded-xl text-sm font-bold bg-cyan-600 text-white disabled:opacity-50">Save</button>
                </div>
              </div>
            )}

            {/* Cardio History */}
            {cardioSessions.length > 0 ? (
              <div className="space-y-2">
                {[...cardioSessions].reverse().slice(0, 20).map(session => (
                  <div key={session.id} className="bg-slate-900/60 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      session.type === 'HIIT' ? 'bg-red-500/15 text-red-400' :
                      session.type === 'LISS' ? 'bg-green-500/15 text-green-400' :
                      session.type === 'Conditioning' ? 'bg-orange-500/15 text-orange-400' :
                      'bg-blue-500/15 text-blue-400'
                    }`}>
                      {session.type === 'HIIT' ? '\u26A1' : session.type === 'LISS' ? '\uD83C\uDFC3' : session.type === 'Conditioning' ? '\uD83D\uDD25' : '\u26BD'}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">{session.activity}</div>
                      <div className="text-xs text-slate-400">{session.date} &bull; {session.type} &bull; {session.durationMinutes}min{session.distanceKm ? ` \u2022 ${session.distanceKm}km` : ''}</div>
                    </div>
                    <div className="text-right">
                      {session.caloriesBurned && <div className="text-sm font-bold text-orange-400">{session.caloriesBurned} kcal</div>}
                      {session.avgHeartRate && <div className="text-xs text-red-400">{'\u2665'} {session.avgHeartRate} bpm</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-slate-500 space-y-3">
                <Activity size={48} className="mx-auto opacity-30" />
                <p className="font-game text-lg">NO CARDIO YET</p>
                <p className="text-sm">Log your first cardio session</p>
              </div>
            )}
          </div>
        )}

        {/* ===== AI COACH + PROGRAM DESIGNER TAB ===== */}
        {activeTab === 'coach' && (
          <div className="space-y-4">
            {/* Mode Switcher */}
            <div className="flex gap-2">
              <button
                onClick={() => setIsPlanningMode(false)}
                className={`flex-1 py-2 text-sm font-game rounded-xl transition-all ${!isPlanningMode ? 'bg-rose-600 text-white' : 'bg-slate-900/40 text-slate-400 border border-white/10 hover:text-white'}`}
              >
                <Zap size={14} className="inline mr-1" /> Coach
              </button>
              <button
                onClick={() => setIsPlanningMode(true)}
                className={`flex-1 py-2 text-sm font-game rounded-xl transition-all ${isPlanningMode ? 'bg-violet-600 text-white' : 'bg-slate-900/40 text-slate-400 border border-white/10 hover:text-white'}`}
              >
                <Calendar size={14} className="inline mr-1" /> Design Program
              </button>
            </div>

            {/* Saved Program Status */}
            {trainingProgram && !isPlanningMode && programProgress && (
              <div className="bg-slate-900/60 border border-violet-500/20 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-game text-sm text-violet-400 flex items-center gap-1.5">
                    <Calendar size={14} /> {trainingProgram.name}
                  </h3>
                  <span className="text-xs text-slate-400">
                    Week {trainingProgram.currentWeek}/{trainingProgram.totalWeeks}
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2">
                  <div
                    className="bg-violet-500 h-2 rounded-full transition-all"
                    style={{ width: `${programProgress.pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{programProgress.completedDays}/{programProgress.totalDays} sessions</span>
                  <span>{programProgress.pct}%</span>
                </div>
                {trainingProgram.iterationCount > 0 && (
                  <p className="text-xs text-amber-400/80">
                    Iterated {trainingProgram.iterationCount}x based on performance
                  </p>
                )}
              </div>
            )}

            {!isPlanningMode ? (
              <>
                {/* Coach Mode */}
                <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-2">
                  <h3 className="font-game text-base text-rose-400 flex items-center gap-1.5"><Zap size={16} /> AI WORKOUT COACH</h3>
                  <p className="text-xs text-slate-400">Ask anything — the AI reads your history, diet, fatigue, and active program.</p>
                </div>

                {chatHistory.length > 0 && (
                  <div className="space-y-3">
                    {chatHistory.map((chat, i) => (
                      <div key={i} className="space-y-2">
                        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3 ml-8">
                          <p className="text-sm text-rose-200">{chat.q}</p>
                        </div>
                        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 mr-4">
                          <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{chat.a}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={coachQuestion}
                      onChange={(e) => setCoachQuestion(e.target.value)}
                      placeholder="Ask your AI coach..."
                      className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder:text-slate-500"
                      onKeyDown={(e) => e.key === 'Enter' && askCoach()}
                    />
                    <button
                      onClick={askCoach}
                      disabled={isCoachThinking || !coachQuestion.trim()}
                      className="px-3 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-500 disabled:opacity-50 transition-all"
                    >
                      {isCoachThinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs text-slate-400 font-game px-1">QUICK QUESTIONS</h4>
                  {[
                    "What should I train today based on my history?",
                    "Am I eating enough protein for my training?",
                    "How can I break through my plateau?",
                    "What's my weakest muscle group?",
                    "Should I increase my training volume?",
                  ].map((q, i) => (
                    <button
                      key={i}
                      onClick={() => { setCoachQuestion(q); }}
                      className="w-full bg-slate-900/40 border border-white/5 rounded-xl px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-slate-800/60 hover:text-white transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Program Designer Mode */}
                <div className="bg-slate-900/60 border border-violet-500/20 rounded-2xl p-4 space-y-2">
                  <h3 className="font-game text-base text-violet-400 flex items-center gap-1.5"><Calendar size={16} /> PROGRAM DESIGNER</h3>
                  <p className="text-xs text-slate-400">
                    The AI will ask about your goals, preferences, and weak points, then design a complete mesocycle program that auto-adjusts as you train.
                  </p>
                </div>

                {planChatHistory.length === 0 && (
                  <button
                    onClick={() => askProgramDesigner('I want to design a new training program.')}
                    disabled={isCoachThinking}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-game rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isCoachThinking ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    Start Designing
                  </button>
                )}

                {planChatHistory.length > 0 && (
                  <div className="space-y-3">
                    {planChatHistory.map((msg, i) => (
                      <div
                        key={i}
                        className={`rounded-2xl p-3 ${
                          msg.role === 'user'
                            ? 'bg-violet-500/10 border border-violet-500/20 ml-8'
                            : 'bg-slate-900/60 border border-white/10 mr-4'
                        }`}
                      >
                        <p className={`text-sm whitespace-pre-wrap leading-relaxed ${
                          msg.role === 'user' ? 'text-violet-200' : 'text-slate-200'
                        }`}>{msg.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending Program Preview */}
                {pendingProgram && (
                  <div className="bg-slate-900/60 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-game text-sm text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 size={14} /> Program Ready
                      </h3>
                      <button
                        onClick={() => saveProgram(pendingProgram)}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg transition-all"
                      >
                        Save & Activate
                      </button>
                    </div>
                    <div className="text-xs text-slate-300 space-y-1">
                      <p><strong>{pendingProgram.name}</strong> — {pendingProgram.splitType}</p>
                      <p>{pendingProgram.totalWeeks} weeks, {pendingProgram.daysPerWeek} days/week, Phase: {pendingProgram.phase}</p>
                      {pendingProgram.specialization?.length > 0 && (
                        <p>Specialization: {pendingProgram.specialization.join(', ')}</p>
                      )}
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {pendingProgram.weeks.map(week => (
                        <div key={week.weekNumber} className="bg-slate-800/60 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">
                              Week {week.weekNumber} {week.isDeload && <span className="text-amber-400">(Deload)</span>}
                            </span>
                            <span className="text-xs text-slate-500">{week.volumeLevel}</span>
                          </div>
                          {week.days.map(day => (
                            <div key={day.dayNumber} className="text-xs text-slate-400 pl-2 border-l border-slate-700">
                              <span className="text-slate-300 font-medium">{day.label}:</span>{' '}
                              {day.exercises.map(e => e.name).join(', ')}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {planChatHistory.length > 0 && !pendingProgram && (
                  <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={coachQuestion}
                        onChange={(e) => setCoachQuestion(e.target.value)}
                        placeholder="Reply to the designer..."
                        className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder:text-slate-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && coachQuestion.trim()) {
                            askProgramDesigner(coachQuestion);
                            setCoachQuestion('');
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          if (coachQuestion.trim()) {
                            askProgramDesigner(coachQuestion);
                            setCoachQuestion('');
                          }
                        }}
                        disabled={isCoachThinking || !coachQuestion.trim()}
                        className="px-3 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500 disabled:opacity-50 transition-all"
                      >
                        {isCoachThinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                    </div>
                  </div>
                )}

                {planChatHistory.length > 0 && (
                  <button
                    onClick={() => { setPlanChatHistory([]); setPendingProgram(undefined); }}
                    className="w-full py-2 text-xs text-slate-500 hover:text-red-400 transition-colors"
                  >
                    Reset Conversation
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
