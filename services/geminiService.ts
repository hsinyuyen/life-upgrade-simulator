
import { GoogleGenAI, Type } from "@google/genai";
import { Category, GeminiAnalysisResponse, EmergencyApprovalResponse, UserStats, DietProfile, BodyLog, DietPlan, Recipe, WorkoutSession, DietData, StoryState, StoryChapter, CharacterSkin, TrainingCycle, TrainingPhase, ExerciseType, E1RMEntry, BodyPart, TrainingProgram, ProgramDay, SavedExercise, PHASE_CONFIG, WeeklyReport, TrendSnapshot, WorkoutData, RecoveryScore, CardioSession } from "../types";

export interface STAContext {
  cycle: TrainingCycle;
  overallFatigue: number;
  bodyPartFatigue?: Record<BodyPart, number>;
  weeklyMuscleSets?: Record<BodyPart, number>;
  exerciseE1RMs: Record<string, E1RMEntry[]>;
  exerciseTypes: Record<string, ExerciseType>;
}

export class GeminiService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("Gemini API Key is missing! Please check your .env file.");
    } else {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  private getAI(): GoogleGenAI {
    if (!this.ai) {
      throw new Error("Gemini API Key is not configured. AI features are unavailable.");
    }
    return this.ai;
  }

  async analyzeActivity(description: string): Promise<GeminiAnalysisResponse> {
    const prompt = `Analyze this real-life activity: "${description}". 
    Categorize it into exactly one of: Health, Career, Knowledge, "Family & Socializing", or Leisure. 
    Assign an XP reward (10 to 200) based on effort and impact on self-improvement.
    Note: Leisure activities are considered negative/deduction type - they reduce XP.
    Family & Socializing = time with family, friends, community, social events.
    Provide a super short, fun game-like encouragement message.`;

    const response = await this.getAI().models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            points: { type: Type.NUMBER },
            category: { type: Type.STRING, enum: Object.values(Category) },
            message: { type: Type.STRING }
          },
          required: ["points", "category", "message"]
        }
      }
    });

    try {
      return JSON.parse(response.text || '{}') as GeminiAnalysisResponse;
    } catch (e) {
      return { points: 50, category: Category.KNOWLEDGE, message: "Nice work!" };
    }
  }

  async approveEmergency(description: string): Promise<EmergencyApprovalResponse> {
    const prompt = `You are an AI life coach evaluating whether a task qualifies as an EMERGENCY mission.
    An emergency mission must be something that:
    1. Is critically important to the user's life, health, career, or immediate wellbeing
    2. Requires immediate attention or has urgent deadlines
    3. Would have significant negative consequences if delayed
    
    Examples that SHOULD be approved: medical appointments, work deadlines due today/tomorrow, paying overdue bills, fixing broken essential equipment, family emergencies
    Examples that should NOT be approved: watching a movie, casual shopping, social media, playing games, routine tasks that aren't urgent
    
    The user's task: "${description}"
    
    Evaluate strictly. Only approve genuinely urgent/important tasks.`;

    const response = await this.getAI().models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            approved: { type: Type.BOOLEAN },
            reason: { type: Type.STRING }
          },
          required: ["approved", "reason"]
        }
      }
    });

    try {
      return JSON.parse(response.text || '{}') as EmergencyApprovalResponse;
    } catch (e) {
      return { approved: false, reason: "Could not evaluate. Please try again." };
    }
  }

  async analyzeQuest(name: string): Promise<Partial<QuestItem>> {
    const prompt = `You are a game designer for a long-term (10-year) life RPG. 
    Analyze this quest name: "${name}" and generate appropriate game stats.
    
    CONTEXT:
    - This is a 10-year project. Progress should be meaningful but steady.
    - Level XP requirements scale: Lv1:1000, Lv2:2000, Lv3:4000, Lv4:6000, Lv5:8000, Lv6:10000, Lv7:12000, Lv8:14000, Lv9:16000, Lv10:18000.
    - Quests should have balanced XP rewards. A small daily task might be 10-30 XP. A major milestone might be 100-300 XP.
    
    CATEGORIES:
    - Health: Exercise, sleep, diet.
    - Career: Work, productivity, finance.
    - Knowledge: Reading, learning, skills.
    - Family & Socializing: Social events, family time.
    - Leisure: (Deduction type) Entertainment, gaming, social media (these cost XP/Neurozoids).
    
    REQUIRED FIELDS:
    - category: One of the above.
    - base_points: XP reward (positive for most, negative for Leisure).
    - isDeduction: true if category is Leisure.
    - unitLabel: (Optional) e.g., "minutes", "pages", "sets".
    - unitBase: (Optional) The amount for the base_points (e.g., 10 for "10 minutes").
    - decayPerRepeat: How much XP reward decreases if done multiple times a day (usually 10-20% of base_points).
    - minPoints: Minimum XP reward after decay (can be negative for bad habits).
    
    Return valid JSON.`;

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: prompt }] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING, enum: Object.values(Category) },
              base_points: { type: Type.NUMBER },
              isDeduction: { type: Type.BOOLEAN },
              unitLabel: { type: Type.STRING },
              unitBase: { type: Type.NUMBER },
              decayPerRepeat: { type: Type.NUMBER },
              minPoints: { type: Type.NUMBER }
            },
            required: ["category", "base_points", "isDeduction"]
          }
        }
      });

      return JSON.parse(response.text || '{}');
    } catch (e) {
      console.error("Quest analysis failed:", e);
      return { category: Category.KNOWLEDGE, base_points: 50, isDeduction: false };
    }
  }

  async generateAvatar(basePhotoBase64: string, stats: UserStats): Promise<string | null> {
    const healthPct = Math.round((stats.healthXP / stats.xpToNextLevel) * 100);
    const careerPct = Math.round((stats.careerXP / stats.xpToNextLevel) * 100);
    const knowledgePct = Math.round((stats.knowledgeXP / stats.xpToNextLevel) * 100);
    const familySocialPct = Math.round(((stats.familySocialXP ?? 0) / stats.xpToNextLevel) * 100);

    const prompt = `Transform this person into a high-quality 3D Pixar/Disney style avatar. 
    Currently, they are Level ${stats.level}. 
    Stats: Health: ${healthPct}%, Career: ${careerPct}%, Knowledge: ${knowledgePct}%, Family & Social: ${familySocialPct}%.
    Based on these stats, upgrade their appearance. 
    If Health is high, make them look more athletic. 
    If Career is high, give them professional or luxury accessories. 
    If Knowledge is high, add intellectual or magical elements. 
    If Family & Social is high, add warm, friendly, or community-oriented elements.
    The style must be 3D rendered, vibrant, and heroic.`;

    const response = await this.getAI().models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: basePhotoBase64.split(',')[1] || basePhotoBase64,
              mimeType: 'image/png',
            },
          },
          { text: prompt },
        ],
      },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  }

  private async generateSingleCharacterState(
    basePhotoBase64: string,
    state: 'normal' | 'buff' | 'debuff' | 'both',
    level: number,
    theme?: string
  ): Promise<string | null> {
    const stateDescriptions: Record<string, string> = {
      normal: 'The character is in their default, calm state. Confident posture, neutral expression, balanced energy.',
      buff: 'The character is POWERED UP! Glowing golden/green aura, energized eyes, radiating strength and vitality. Sparks of light surround them.',
      debuff: 'The character is WEAKENED. Dark purple/red shadows around them, tired expression, slightly hunched, cracked or fading energy.',
      both: 'The character has CONFLICTING energies. Half glowing with golden power, half shrouded in dark shadows. A dramatic split of buff and debuff energy.',
    };

    const levelDescriptions: Record<number, string> = {
      1: 'Lv.1 — A beginner adventurer. Simple cloth/leather outfit, basic gear, modest but determined look.',
      2: 'Lv.2 — An apprentice warrior. Upgraded armor with some embellishments, a visible weapon or tool, growing confidence.',
      3: 'Lv.3 — A seasoned fighter. Well-crafted armor with glowing runes or sigils, a signature weapon, strong presence.',
      4: 'Lv.4 — An elite champion. Ornate legendary armor, powerful aura, epic-tier weapon, commanding battlefield presence.',
      5: 'Lv.5 — A mythic hero / demigod. God-tier radiant armor, celestial wings or halo, reality-bending power emanating from them.',
    };

    const clampedLevel = Math.max(1, Math.min(5, level));
    const levelDesc = levelDescriptions[clampedLevel];

    const themeInstruction = theme
      ? `Apply a "${theme}" theme/style to the character. Reimagine them in this aesthetic while keeping their face recognizable from the photo.`
      : '';

    const prompt = `Use this person's photo as reference. Design a FULL-BODY game character avatar inspired by their appearance (face, hair, skin tone, build).

${levelDesc}
${themeInstruction}

State: ${stateDescriptions[state]}

Art style: High-quality 3D rendered, vibrant colors, dramatic lighting, RPG/action game style.
Composition: FULL BODY shot. The character must be standing in the center of the frame.
Important: The character's entire body from head to toe (including feet and any headgear) MUST be visible within the image boundaries.
Scale: Zoom out significantly. The character should occupy only the middle 60% of the vertical space.
Padding: Leave large empty spaces (at least 20% of the image height) at both the top and bottom to ensure no part of the character is cropped.
Background: Simple dark gradient background. Square format.`;

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: basePhotoBase64.split(',')[1] || basePhotoBase64,
                mimeType: 'image/png',
              },
            },
            { text: prompt },
          ],
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    } catch (e) {
      console.error(`Character state generation failed (${state}):`, e);
    }
    return null;
  }

  async generateCharacterStates(
    basePhotoBase64: string,
    level: number,
    theme?: string,
    onProgress?: (state: string, index: number) => void
  ): Promise<{ normal: string; buff: string; debuff: string; both: string } | null> {
    const states: Array<'normal' | 'buff' | 'debuff' | 'both'> = ['normal', 'buff', 'debuff', 'both'];
    const results: Record<string, string> = {};

    for (let i = 0; i < states.length; i++) {
      const state = states[i];
      onProgress?.(state, i);
      const result = await this.generateSingleCharacterState(basePhotoBase64, state, level, theme);
      if (!result) return null;
      results[state] = result;
    }

    return results as { normal: string; buff: string; debuff: string; both: string };
  }

  async generateDietPlan(profile: DietProfile, workoutData?: WorkoutData): Promise<DietPlan | null> {
    let trainingContext = '';
    if (workoutData) {
      const tp = workoutData.trainingProgram;
      if (tp) {
        trainingContext += `\n## Current Training Program:
    - Program: "${tp.name}"
    - Phase: ${tp.phase} (${tp.phase === 'Bulk' ? 'caloric surplus needed' : tp.phase === 'Cut' ? 'caloric deficit, high protein to preserve muscle' : 'slight deficit or maintenance'})
    - Split: ${tp.splitType}, ${tp.daysPerWeek} training days/week
    - Week ${tp.currentWeek} of ${tp.totalWeeks}
    - IMPORTANT: Align calorie/macro targets with this training phase.`;
      }
      if (workoutData.currentCycle) {
        const cycle = workoutData.currentCycle;
        trainingContext += `\n    - Training Cycle Phase: ${cycle.phase}, Fatigue: ${cycle.accumulatedFatigue}/10`;
      }
      const recentSessions = workoutData.sessions.slice(-5);
      if (recentSessions.length > 0) {
        const avgSets = Math.round(recentSessions.reduce((s, sess) => s + sess.totalSets, 0) / recentSessions.length);
        trainingContext += `\n    - Recent avg volume: ${avgSets} sets/session across ${recentSessions.length} workouts`;
      }
    }

    const prompt = `You are an expert nutritionist who integrates diet with training. Create a complete daily diet plan based on these stats:
    - Height: ${profile.height}cm
    - Weight: ${profile.weight}kg
    ${profile.muscleMass ? `- Muscle Mass: ${profile.muscleMass}kg` : ''}
    ${profile.bodyFat ? `- Body Fat: ${profile.bodyFat}%` : ''}
    - Goal: ${profile.goal.toUpperCase()} (${profile.goal === 'bulk' ? 'gain muscle/weight' : profile.goal === 'cut' ? 'lose fat, preserve muscle' : 'lose fat and gain muscle simultaneously'})
    - Diet Preferences: ${profile.preferences || 'None specified'}
    ${profile.targetCalories ? `- Target Calories: ${profile.targetCalories}` : ''}
    ${trainingContext}

    ${workoutData?.trainingProgram ? `Base your calorie and macro calculations on the training phase:
    - Bulk: surplus 300-500kcal above TDEE, protein 1.8-2.2g/kg, higher carbs for performance
    - Cut: deficit 300-500kcal below TDEE, protein 2.2-2.8g/kg to preserve muscle, moderate carbs
    - Recomp: near maintenance, protein 2.0-2.4g/kg, cycle carbs around training days
    - Consider training volume and fatigue when setting carb intake.` : ''}

    Create TWO versions of the diet plan:
    1. **Training Day** — higher carbs and calories to fuel workouts and recovery
    2. **Rest Day** — lower carbs and slightly fewer calories, maintain protein

    Each version should have 4-6 recipes (breakfast, lunch, dinner, 1-2 snacks).
    Also generate a consolidated grocery list covering both versions.
    Include an "aiNotes" field with brief dietary advice${workoutData?.trainingProgram ? ' that references how the diet supports the current training phase' : ''}.

    IMPORTANT: Return valid JSON matching this exact structure:
    {
      "trainingDay": {
        "recipes": [{ "name": "...", "mealType": "breakfast|lunch|dinner|snack", "ingredients": ["item1", "item2"], "instructions": "step by step...", "calories": 500, "protein": 30, "carbs": 50, "fat": 15, "servings": 1 }],
        "totalCalories": 2500,
        "totalProtein": 180,
        "totalCarbs": 280,
        "totalFat": 70
      },
      "restDay": {
        "recipes": [{ "name": "...", "mealType": "breakfast|lunch|dinner|snack", "ingredients": ["item1", "item2"], "instructions": "step by step...", "calories": 400, "protein": 30, "carbs": 30, "fat": 15, "servings": 1 }],
        "totalCalories": 2000,
        "totalProtein": 180,
        "totalCarbs": 180,
        "totalFat": 65
      },
      "groceryList": [{ "name": "Chicken Breast", "amount": "500g", "category": "Protein" }],
      "aiNotes": "Brief dietary advice..."
    }`;

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: prompt }] },
        config: {
          responseMimeType: 'application/json',
        }
      });

      const data = JSON.parse(response.text || '{}');
      const parseRecipes = (recipes: any[]) => (recipes || []).map((r: any, i: number) => ({
        ...r,
        id: `recipe-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
        servings: r.servings || 1,
      }));

      // Support both new (trainingDay/restDay) and legacy (flat) formats
      const td = data.trainingDay || data;
      const rd = data.restDay;

      const plan: DietPlan = {
        id: Math.random().toString(36).substr(2, 9),
        createdAt: Date.now(),
        recipes: parseRecipes(td.recipes),
        groceryList: data.groceryList || td.groceryList || [],
        totalCalories: td.totalCalories || 0,
        totalProtein: td.totalProtein || 0,
        totalCarbs: td.totalCarbs || 0,
        totalFat: td.totalFat || 0,
        aiNotes: data.aiNotes || td.aiNotes || '',
      };

      if (rd) {
        plan.restDayPlan = {
          recipes: parseRecipes(rd.recipes),
          groceryList: data.groceryList || rd.groceryList || [],
          totalCalories: rd.totalCalories || 0,
          totalProtein: rd.totalProtein || 0,
          totalCarbs: rd.totalCarbs || 0,
          totalFat: rd.totalFat || 0,
        };
      }

      return plan;
    } catch (e) {
      console.error("Diet plan generation failed:", e);
      return null;
    }
  }

  async analyzeDietProgress(profile: DietProfile, bodyLogs: BodyLog[], currentPlan: DietPlan | null): Promise<{ analysis: string; suggestedChanges: string[]; newPlan: DietPlan | null }> {
    const sortedLogs = [...bodyLogs].sort((a, b) => a.date.localeCompare(b.date));
    const recent14 = sortedLogs.slice(-14);
    const logsStr = recent14.map(l =>
      `${l.date}: ${l.weight}kg${l.bodyFat ? `, ${l.bodyFat}% BF` : ''}${l.muscleMass ? `, ${l.muscleMass}kg muscle` : ''}`
    ).join('\n');

    // Calculate body log trends
    const trendAnalysis = this.calculateBodyTrends(recent14);

    const planStr = currentPlan
      ? `Current plan: ${currentPlan.totalCalories}kcal, ${currentPlan.totalProtein}g protein, ${currentPlan.totalCarbs}g carbs, ${currentPlan.totalFat}g fat. Meals: ${currentPlan.recipes.map(r => r.name).join(', ')}`
      : 'No current plan';

    const prompt = `You are an expert nutritionist analyzing body composition progress.

    Profile: Height ${profile.height}cm, Goal: ${profile.goal}
    Preferences: ${profile.preferences || 'None'}

    Body Data History (last 14 entries):
    ${logsStr || 'No data yet'}

    ## Trend Analysis (computed):
    ${trendAnalysis}

    ${planStr}

    Analyze the progress data and provide:
    1. A brief analysis incorporating the computed trends (weight direction, weekly rate of change, body fat changes)
    2. 3-5 specific suggested changes to the diet — be precise about calorie/macro adjustments based on the rate of change
    3. If changes are needed, generate an updated diet plan (same JSON format as before with recipes, groceryList, totalCalories, totalProtein, totalCarbs, totalFat, aiNotes)
    4. If no changes needed, set newPlan to null

    Return JSON: { "analysis": "...", "suggestedChanges": ["change1", "change2"], "newPlan": null | { recipes, groceryList, totalCalories, totalProtein, totalCarbs, totalFat, aiNotes } }`;

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: prompt }] },
        config: {
          responseMimeType: 'application/json',
        }
      });

      const data = JSON.parse(response.text || '{}');
      let newPlan: DietPlan | null = null;
      if (data.newPlan) {
        newPlan = {
          id: Math.random().toString(36).substr(2, 9),
          createdAt: Date.now(),
          recipes: (data.newPlan.recipes || []).map((r: any, i: number) => ({
            ...r,
            id: `recipe-${Date.now()}-${i}`,
            servings: r.servings || 1,
          })),
          groceryList: data.newPlan.groceryList || [],
          totalCalories: data.newPlan.totalCalories || 0,
          totalProtein: data.newPlan.totalProtein || 0,
          totalCarbs: data.newPlan.totalCarbs || 0,
          totalFat: data.newPlan.totalFat || 0,
          aiNotes: data.newPlan.aiNotes || '',
        };
      }

      return {
        analysis: data.analysis || 'Unable to analyze.',
        suggestedChanges: data.suggestedChanges || [],
        newPlan,
      };
    } catch (e) {
      console.error("Diet analysis failed:", e);
      return {
        analysis: 'Analysis failed. Please try again.',
        suggestedChanges: [],
        newPlan: null,
      };
    }
  }
  // ===== STA v2: Coach Advice =====

  private calculateBodyTrends(logs: BodyLog[]): string {
    if (logs.length < 2) return 'Insufficient data for trend analysis.';
    const parts: string[] = [];

    // Weight trend
    const first = logs[0];
    const last = logs[logs.length - 1];
    const totalDelta = last.weight - first.weight;
    const daysBetween = Math.max(1, (new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24));
    const weeklyRate = (totalDelta / daysBetween) * 7;
    const direction = totalDelta > 0.3 ? 'GAINING' : totalDelta < -0.3 ? 'LOSING' : 'STABLE';
    parts.push(`Weight: ${first.weight}kg → ${last.weight}kg (${totalDelta > 0 ? '+' : ''}${totalDelta.toFixed(1)}kg over ${Math.round(daysBetween)}d)`);
    parts.push(`Weekly rate: ${weeklyRate > 0 ? '+' : ''}${weeklyRate.toFixed(2)}kg/week — Direction: ${direction}`);

    // Ideal rate check
    if (direction === 'GAINING' && weeklyRate > 0.5) parts.push('⚠️ Gaining too fast (>0.5kg/wk), likely excess fat gain');
    if (direction === 'LOSING' && weeklyRate < -1.0) parts.push('⚠️ Losing too fast (>1kg/wk), risk of muscle loss');

    // Body fat trend
    const bfLogs = logs.filter(l => l.bodyFat != null);
    if (bfLogs.length >= 2) {
      const bfFirst = bfLogs[0].bodyFat!;
      const bfLast = bfLogs[bfLogs.length - 1].bodyFat!;
      const bfDelta = bfLast - bfFirst;
      parts.push(`Body fat: ${bfFirst}% → ${bfLast}% (${bfDelta > 0 ? '+' : ''}${bfDelta.toFixed(1)}%)`);
    }

    // Muscle mass trend
    const mmLogs = logs.filter(l => l.muscleMass != null);
    if (mmLogs.length >= 2) {
      const mmFirst = mmLogs[0].muscleMass!;
      const mmLast = mmLogs[mmLogs.length - 1].muscleMass!;
      const mmDelta = mmLast - mmFirst;
      parts.push(`Muscle mass: ${mmFirst}kg → ${mmLast}kg (${mmDelta > 0 ? '+' : ''}${mmDelta.toFixed(1)}kg)`);
    }

    // 7-day average vs 14-day average for short-term direction
    if (logs.length >= 7) {
      const recent7 = logs.slice(-7);
      const older7 = logs.slice(-14, -7);
      if (older7.length > 0) {
        const avg7 = recent7.reduce((s, l) => s + l.weight, 0) / recent7.length;
        const avgOlder = older7.reduce((s, l) => s + l.weight, 0) / older7.length;
        const shortDelta = avg7 - avgOlder;
        parts.push(`7d avg vs prior 7d: ${shortDelta > 0 ? '+' : ''}${shortDelta.toFixed(2)}kg`);
      }
    }

    return parts.join('\n');
  }

  private buildWorkoutSummary(recentWorkouts: WorkoutSession[]): string {
    return recentWorkouts.slice(0, 14).map(s => {
      const exDetails = s.exercises.map(e => {
        const rpeVals = e.sets.filter(set => set.rpe != null && set.rpe > 0).map(set => set.rpe);
        const avgRpe = rpeVals.length > 0 ? (rpeVals.reduce((a, b) => a! + b!, 0)! / rpeVals.length).toFixed(1) : 'N/A';
        return `${e.name}(${e.sets.length}s, vol:${e.totalVolume}, RPE:${avgRpe}${e.isPR ? ' PR!' : ''})`;
      }).join(', ');
      return `${s.date}: ${s.bodyParts.join(', ')} — ${exDetails}`;
    }).join('\n') || 'No workout history yet.';
  }

  private buildSTAContext(staContext?: STAContext): string {
    if (!staContext) return '';
    const e1rmLines = Object.entries(staContext.exerciseE1RMs)
      .map(([name, entries]) => {
        const latest = entries[entries.length - 1];
        return latest ? `  ${name}: ${latest.e1rm}kg` : null;
      })
      .filter(Boolean).join('\n');

    const muscleFatigue = staContext.bodyPartFatigue
      ? Object.entries(staContext.bodyPartFatigue)
          .filter(([, v]) => v > 0)
          .map(([bp, v]) => `${bp}: ${v}/10`)
          .join(', ')
      : '';

    const muscleSetCounts = staContext.weeklyMuscleSets
      ? Object.entries(staContext.weeklyMuscleSets)
          .filter(([, v]) => v > 0)
          .map(([bp, v]) => `${bp}: ${v} sets`)
          .join(', ')
      : '';

    return `
【Smart Training Architect v2】
Phase: ${staContext.cycle.phase} (${PHASE_CONFIG[staContext.cycle.phase].motto}) | Week ${staContext.cycle.week}
Overall Fatigue: ${staContext.overallFatigue.toFixed(1)}/10
${muscleFatigue ? `Per-Muscle Fatigue: ${muscleFatigue}` : ''}
${muscleSetCounts ? `Weekly Sets/Muscle: ${muscleSetCounts}` : ''}
${e1rmLines ? `Estimated 1RMs:\n${e1rmLines}` : ''}`;
  }

  async workoutCoachAdvice(
    question: string,
    recentWorkouts: WorkoutSession[],
    dietData: DietData | null,
    staContext?: STAContext,
    aiContext?: string
  ): Promise<string> {
    const workoutSummary = this.buildWorkoutSummary(recentWorkouts);
    const staSection = this.buildSTAContext(staContext);

    const dietSummary = dietData?.currentPlan
      ? `Diet: ${dietData.currentPlan.totalCalories}kcal, ${dietData.currentPlan.totalProtein}g P, ${dietData.currentPlan.totalCarbs}g C, ${dietData.currentPlan.totalFat}g F. Goal: ${dietData.profile?.goal || 'N/A'}.`
      : 'No diet plan.';
    const bodyStats = dietData?.profile
      ? `Body: ${dietData.profile.height}cm, ${dietData.profile.weight}kg${dietData.profile.bodyFat ? `, ${dietData.profile.bodyFat}%BF` : ''}${dietData.profile.muscleMass ? `, ${dietData.profile.muscleMass}kg muscle` : ''}`
      : '';

    const prompt = `# Role: Elite Bodybuilding Coach & Data Analyst

## Core Principles (Renaissance Periodization):
- Track HARD SETS per muscle per week. MEV ~6-8, MAV ~12-20, MRV varies by individual.
- Exercises have tiers: Primary (4-6 reps), Secondary (8-12 reps), Isolation (12-15 reps).
- Double progression: increase reps within range -> when ALL sets hit top of range, increase weight.
- Three deload types: Volume (cut sets), Intensity (cut weight), Full (both).

## Decision Rules:
1. **RPE Calibration**: If user says "easy" but RPE=9+, question accuracy.
2. **Injury Prevention**: Joint pain (not DOMS) -> replace with machine variant or localized deload.
3. **Phase Awareness**: Bulk=push harder, Cut=maintain weight/control, Recomp=balance.
4. **Fatigue Management**: If any muscle's fatigue >7 or overall >7, recommend deload for that area.
5. **Volume Check**: If weekly sets for a muscle exceed ~20, warn about exceeding MRV.

${bodyStats}
${dietSummary}
${staSection}
${aiContext ? `\n## Long-term Trends:\n${aiContext}` : ''}

Recent Workouts:
${workoutSummary}

User's question: "${question}"

Give concise, actionable advice. Reference specific data. Under 300 words. Friendly tone.`;

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: prompt }] },
      });
      return response.text || 'Sorry, I could not generate advice right now.';
    } catch (e) {
      console.error("Workout coach failed:", e);
      return 'AI coach is unavailable right now. Please try again.';
    }
  }

  // ===== STA v2: Program Designer (Conversational) =====

  async programDesignerChat(
    chatHistory: { role: 'user' | 'assistant'; text: string }[],
    recentWorkouts: WorkoutSession[],
    dietData: DietData | null,
    staContext?: STAContext
  ): Promise<{ text: string; program?: TrainingProgram }> {
    const workoutSummary = this.buildWorkoutSummary(recentWorkouts);
    const staSection = this.buildSTAContext(staContext);
    const bodyStats = dietData?.profile
      ? `Body: ${dietData.profile.height}cm, ${dietData.profile.weight}kg${dietData.profile.bodyFat ? `, ${dietData.profile.bodyFat}%BF` : ''}${dietData.profile.muscleMass ? `, ${dietData.profile.muscleMass}kg muscle` : ''}`
      : '';

    const systemPrompt = `# Role: Elite Program Designer (Renaissance Periodization Method)

You are designing a complete mesocycle training program through conversation.

## Your Knowledge Base:
- **Split Selection**: PPL for 6 days, Upper/Lower for 4 days, Full Body for 2-3 days.
- **Frequency**: Each muscle 2x/week optimal for hypertrophy.
- **Volume**: Start at MEV (6-8 sets/muscle/week), ramp +1-2 sets/week, peak near MAV (12-20 sets), then deload.
- **Exercise Order**: Primary compound → Secondary compound → Isolation.
- **Exercise Tiers**: Primary (4-6 reps, +2.5kg), Secondary (8-12 reps, +2.5kg), Isolation (12-15 reps, +1kg).
- **Deload**: Place at end of mesocycle. Volume deload = keep weight, halve sets. Typical: every 4-6 weeks.
- **Phase Rules**: Bulk=higher volume ceiling, aggressive progression. Cut=reduce volume ~30%, maintain intensity. Recomp=moderate.
- **Specialization**: For weak body parts, add +2-4 weekly sets while reducing strong parts by the same amount.

## Conversation Flow:
1. First message: Ask about their GOAL (Bulk/Cut/Recomp) and how many DAYS per week they can train.
2. Second message: Ask about WEAK body parts they want to emphasize, and any INJURIES or exercises to avoid.
3. Third message: Ask about exercise PREFERENCES (free weights vs machines, favorite exercises) and desired program LENGTH (weeks).
4. After collecting enough info (usually 3 rounds), generate the FULL program.

## When Generating the Program:
- Include your explanation and reasoning in plain text FIRST.
- Then include the structured program inside [PROGRAM_JSON]...[/PROGRAM_JSON] tags.
- The JSON MUST follow THIS EXACT SCHEMA (example with 1 week shown):

\`\`\`json
{
  "name": "PPL Hypertrophy Block",
  "phase": "Bulk",
  "totalWeeks": 5,
  "daysPerWeek": 4,
  "splitType": "Upper/Lower",
  "specialization": ["chest", "arm"],
  "aiNotes": "Brief notes about the program design rationale",
  "weeks": [
    {
      "weekNumber": 1,
      "isDeload": false,
      "volumeLevel": "MEV",
      "days": [
        {
          "dayNumber": 1,
          "label": "Upper A",
          "bodyParts": ["chest", "back", "shoulder", "arm"],
          "exercises": [
            {
              "name": "Barbell Bench Press",
              "exerciseType": "Primary",
              "targetSets": 4,
              "targetReps": "4-6",
              "targetRPE": 8,
              "targetWeight": 80,
              "targetMuscles": ["chest", "shoulder"],
              "notes": ""
            }
          ]
        }
      ]
    }
  ]
}
\`\`\`

CRITICAL RULES for the JSON:
- "phase" must be one of: "Bulk", "Cut", "Recomp"
- "exerciseType" must be one of: "Primary", "Secondary", "Isolation"
- "targetMuscles" and "bodyParts" use: "chest", "back", "shoulder", "arm", "leg", "core", "cardio"
- "targetReps" is a STRING like "4-6", "8-12", "12-15"
- "targetWeight" is a number in kg (use null if unknown)
- "volumeLevel" per week: "MEV", "MEV+1", "MEV+2", "MAV", "Deload"
- ALWAYS include a deload week as the last week with "isDeload": true
- Every week must have the same number of days (matching daysPerWeek)
- Each exercise MUST have all fields: name, exerciseType, targetSets, targetReps, targetRPE, targetWeight, targetMuscles, notes

${bodyStats}
${staSection}

Recent Training History:
${workoutSummary}`;

    const messages: { role: 'user' | 'model'; parts: { text: string }[] }[] = [
      { role: 'user', parts: [{ text: systemPrompt + '\n\nPlease start the conversation by asking me about my goals.' }] },
    ];

    for (const msg of chatHistory) {
      messages.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] });
    }

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: messages,
      });
      const text = response.text || '';

      let program: TrainingProgram | undefined;
      const jsonMatch = text.match(/\[PROGRAM_JSON\]([\s\S]*?)\[\/PROGRAM_JSON\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          program = this.normalizeProgram(parsed);
        } catch (e) {
          console.error("Failed to parse program JSON:", e);
        }
      }

      const cleanText = text.replace(/\[PROGRAM_JSON\][\s\S]*?\[\/PROGRAM_JSON\]/, '').trim();
      return { text: cleanText, program };
    } catch (e) {
      console.error("Program designer failed:", e);
      return { text: 'Program designer is unavailable. Please try again.' };
    }
  }

  private normalizeProgram(parsed: any): TrainingProgram {
    const weeks = (parsed.weeks || []).map((w: any, wi: number) => ({
      weekNumber: w.weekNumber ?? wi + 1,
      isDeload: w.isDeload ?? false,
      volumeLevel: w.volumeLevel ?? 'MEV',
      days: (w.days || []).map((d: any, di: number) => ({
        dayNumber: d.dayNumber ?? di + 1,
        label: d.label || `Day ${di + 1}`,
        bodyParts: d.bodyParts || [],
        exercises: (d.exercises || []).map((e: any) => ({
          name: e.name || 'Unknown',
          exerciseType: (['Primary', 'Secondary', 'Isolation'].includes(e.exerciseType) ? e.exerciseType : 'Secondary') as ExerciseType,
          targetSets: e.targetSets ?? e.sets ?? 3,
          targetReps: String(e.targetReps ?? e.reps ?? '8-12'),
          targetRPE: e.targetRPE ?? e.rpe ?? 8,
          targetWeight: e.targetWeight ?? null,
          targetMuscles: e.targetMuscles || d.bodyParts || [],
          notes: e.notes ?? '',
        })),
        completed: d.completed ?? false,
        completedSessionId: d.completedSessionId,
        completedAt: d.completedAt,
      })),
    }));

    return {
      id: `prog-${Date.now()}`,
      name: parsed.name || 'Training Program',
      phase: (['Bulk', 'Cut', 'Recomp'].includes(parsed.phase) ? parsed.phase : 'Recomp') as TrainingPhase,
      totalWeeks: parsed.totalWeeks ?? weeks.length,
      daysPerWeek: parsed.daysPerWeek ?? (weeks[0]?.days?.length || 4),
      splitType: parsed.splitType || 'Custom',
      specialization: parsed.specialization || [],
      weeks,
      createdAt: Date.now(),
      aiNotes: parsed.aiNotes || '',
      currentWeek: parsed.currentWeek ?? 1,
      currentDayInWeek: parsed.currentDayInWeek ?? 1,
      iterationCount: parsed.iterationCount ?? 0,
    };
  }

  // ===== Plan Discussion: Modify existing program without resetting progress =====

  async planDiscussionChat(
    chatHistory: { role: 'user' | 'assistant'; text: string }[],
    currentProgram: TrainingProgram,
    recentWorkouts: WorkoutSession[],
    dietData: DietData | null,
    staContext?: STAContext,
    aiContext?: string
  ): Promise<{ text: string; updatedProgram?: TrainingProgram }> {
    const workoutSummary = this.buildWorkoutSummary(recentWorkouts);
    const staSection = this.buildSTAContext(staContext);
    const bodyStats = dietData?.profile
      ? `Body: ${dietData.profile.height}cm, ${dietData.profile.weight}kg${dietData.profile.bodyFat ? `, ${dietData.profile.bodyFat}%BF` : ''}${dietData.profile.muscleMass ? `, ${dietData.profile.muscleMass}kg muscle` : ''}`
      : '';

    // Serialize current program with completion status
    const programJSON = JSON.stringify(currentProgram, null, 2);

    const systemPrompt = `# Role: Training Plan Consultant

You are reviewing and potentially modifying an EXISTING training program. The user wants to discuss their plan and possibly make changes.

## CRITICAL RULES:
1. **NEVER reset progress**: All days with "completed": true MUST remain completed. Do NOT change completed, completedSessionId, or completedAt fields.
2. **NEVER change currentWeek or currentDayInWeek** unless the user explicitly asks to skip ahead.
3. **Preserve the program ID, createdAt, and iterationCount**.
4. You may modify FUTURE (uncompleted) days: change exercises, sets, reps, RPE, weights, or add/remove exercises.
5. You may add or remove entire future weeks (but never delete completed weeks).
6. You may change the program name, phase, specialization, or aiNotes.

## When suggesting a modification:
- First explain what you would change and WHY in plain text.
- Ask "Should I apply this change?" before outputting the modified program.
- If the user confirms, output the FULL updated program inside [PROGRAM_UPDATE]...[/PROGRAM_UPDATE] tags.
- The JSON must be the COMPLETE program object (same schema as the current one), with all completed days preserved exactly as-is.

## Current Program:
\`\`\`json
${programJSON}
\`\`\`

${bodyStats}
${staSection}
${aiContext ? `\n## Long-term Trends:\n${aiContext}` : ''}

Recent Training History:
${workoutSummary}`;

    const messages: { role: 'user' | 'model'; parts: { text: string }[] }[] = [
      { role: 'user', parts: [{ text: systemPrompt + '\n\nI want to discuss my current training plan.' }] },
      { role: 'model', parts: [{ text: 'I can see your current program. What would you like to discuss or change? I can help with:\n- Swapping exercises\n- Adjusting volume (sets/reps)\n- Changing intensity (RPE/weight targets)\n- Adding or removing training days\n- Modifying the remaining weeks\n\nWhat\'s on your mind?' }] },
    ];

    for (const msg of chatHistory) {
      messages.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] });
    }

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: messages,
      });
      const text = response.text || '';

      let updatedProgram: TrainingProgram | undefined;
      const jsonMatch = text.match(/\[PROGRAM_UPDATE\]([\s\S]*?)\[\/PROGRAM_UPDATE\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          // Preserve critical fields from original program
          updatedProgram = {
            ...this.normalizeProgram(parsed),
            id: currentProgram.id,
            createdAt: currentProgram.createdAt,
            iterationCount: currentProgram.iterationCount,
            currentWeek: parsed.currentWeek ?? currentProgram.currentWeek,
            currentDayInWeek: parsed.currentDayInWeek ?? currentProgram.currentDayInWeek,
          };
          // Restore completed status from original for safety
          for (let wi = 0; wi < Math.min(currentProgram.weeks.length, updatedProgram.weeks.length); wi++) {
            for (let di = 0; di < Math.min(currentProgram.weeks[wi].days.length, updatedProgram.weeks[wi].days.length); di++) {
              const origDay = currentProgram.weeks[wi].days[di];
              if (origDay.completed) {
                updatedProgram.weeks[wi].days[di].completed = true;
                updatedProgram.weeks[wi].days[di].completedSessionId = origDay.completedSessionId;
                updatedProgram.weeks[wi].days[di].completedAt = origDay.completedAt;
              }
            }
          }
        } catch (e) {
          console.error("Failed to parse plan update JSON:", e);
        }
      }

      const cleanText = text.replace(/\[PROGRAM_UPDATE\][\s\S]*?\[\/PROGRAM_UPDATE\]/, '').trim();
      return { text: cleanText, updatedProgram };
    } catch (e) {
      console.error("Plan discussion failed:", e);
      return { text: 'Plan discussion is unavailable right now. Please try again.' };
    }
  }

  // ===== STA v2: Program Iteration (Post-Session Auto-Adjust) =====

  async iterateProgram(
    program: TrainingProgram,
    completedSession: WorkoutSession,
    plannedDay: ProgramDay,
    staContext: STAContext,
    aiContext?: string
  ): Promise<{ updatedProgram: TrainingProgram; summary: string }> {
    const comparisonLines = plannedDay.exercises.map(planned => {
      const actual = completedSession.exercises.find(
        e => e.name.toLowerCase() === planned.name.toLowerCase()
      );
      if (!actual) return `${planned.name}: SKIPPED (planned ${planned.targetSets}s x ${planned.targetReps} @RPE${planned.targetRPE})`;

      const actualRpes = actual.sets.filter(s => s.rpe != null && s.rpe > 0).map(s => s.rpe!);
      const avgActualRpe = actualRpes.length > 0 ? (actualRpes.reduce((a, b) => a + b, 0) / actualRpes.length).toFixed(1) : 'N/A';
      const actualReps = actual.sets.map(s => s.reps).join('/');
      return `${planned.name}: Plan=${planned.targetSets}s x ${planned.targetReps} @RPE${planned.targetRPE} ${planned.targetWeight ? planned.targetWeight + 'kg' : ''} | Actual=${actual.sets.length}s x [${actualReps}] @RPE${avgActualRpe} ${actual.sets[0]?.weight || 0}kg`;
    }).join('\n');

    const staSection = this.buildSTAContext(staContext);
    const remainingWeeks = program.weeks.filter(w =>
      w.days.some(d => !d.completed)
    ).length;

    // Build a compact view of future (uncompleted) days for AI reference
    const futureDaysSummary = program.weeks.map(w => {
      const futureDays = w.days.filter(d => !d.completed);
      if (futureDays.length === 0) return null;
      const dayLines = futureDays.map(d =>
        `  D${d.dayNumber} "${d.label}": ${d.exercises.map(e => `${e.name}(${e.targetSets}s×${e.targetReps}@RPE${e.targetRPE}${e.targetWeight ? ' ' + e.targetWeight + 'kg' : ''})`).join(', ')}`
      ).join('\n');
      return `W${w.weekNumber}${w.isDeload ? ' [DELOAD]' : ''}:\n${dayLines}`;
    }).filter(Boolean).join('\n');

    const prompt = `# Role: Program Iteration Engine (Diff-based)

You are reviewing a completed session and suggesting adjustments to FUTURE sessions only.

## Current Program: "${program.name}" (${program.splitType}, ${program.phase})
Week ${program.currentWeek} of ${program.totalWeeks} | ${remainingWeeks} weeks remaining

## Today's Performance vs Plan:
${comparisonLines}

${staSection}
${aiContext ? `\n## Long-term Trends:\n${aiContext}` : ''}

## Remaining Program (uncompleted days only):
${futureDaysSummary}

## Iteration Rules:
1. **Minor adjust (default)**: If actual close to plan, apply double progression to NEXT session with these exercises. Increase weight if all sets hit top rep range at RPE<=9.
2. **Exercise swap**: If exercise missed targets badly, suggest replacing with an equivalent movement.
3. **Structural change**: If overall fatigue >7, consider reducing sets or noting deload need.
4. **Phase awareness**: During Cut, do NOT increase volume. During Bulk, can add sets if fatigue allows.

## CRITICAL — Output Format:
Do NOT return a full program. Return ONLY a JSON array of changes inside [CHANGES]...[/CHANGES] tags.
Each change object has: { "week": number, "day": number, "exercise": "name", "action": "adjust"|"swap"|"remove"|"add", "updates": { targetSets?, targetReps?, targetRPE?, targetWeight?, newName?, newExercise? } }

Example:
[CHANGES]
[
  { "week": 2, "day": 1, "exercise": "Bench Press", "action": "adjust", "updates": { "targetWeight": 82.5 } },
  { "week": 2, "day": 3, "exercise": "Overhead Press", "action": "swap", "updates": { "newName": "Dumbbell Press", "targetSets": 3, "targetReps": "10-12", "targetRPE": 8 } }
]
[/CHANGES]

After the changes, write a 1-2 sentence summary of what you changed and why.`;

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: prompt }] },
      });
      const text = response.text || '';

      // Apply diff-based changes to the original program (never replace it)
      let updatedProgram = structuredClone(program);
      const changesMatch = text.match(/\[CHANGES\]([\s\S]*?)\[\/CHANGES\]/);
      if (changesMatch) {
        try {
          const changes: Array<{
            week: number; day: number; exercise: string;
            action: 'adjust' | 'swap' | 'remove' | 'add';
            updates: { targetSets?: number; targetReps?: string; targetRPE?: number; targetWeight?: number; newName?: string; newExercise?: any };
          }> = JSON.parse(changesMatch[1]);

          for (const change of changes) {
            const weekIdx = updatedProgram.weeks.findIndex(w => w.weekNumber === change.week);
            if (weekIdx < 0) continue;
            const week = updatedProgram.weeks[weekIdx];
            const dayIdx = week.days.findIndex(d => d.dayNumber === change.day);
            if (dayIdx < 0) continue;
            const day = week.days[dayIdx];

            // Never modify completed days
            if (day.completed) continue;

            const exIdx = day.exercises.findIndex(e => e.name.toLowerCase() === change.exercise.toLowerCase());

            switch (change.action) {
              case 'adjust':
                if (exIdx >= 0) {
                  const ex = day.exercises[exIdx];
                  if (change.updates.targetSets != null) ex.targetSets = change.updates.targetSets;
                  if (change.updates.targetReps != null) ex.targetReps = change.updates.targetReps;
                  if (change.updates.targetRPE != null) ex.targetRPE = change.updates.targetRPE;
                  if (change.updates.targetWeight != null) ex.targetWeight = change.updates.targetWeight;
                }
                break;
              case 'swap':
                if (exIdx >= 0) {
                  const ex = day.exercises[exIdx];
                  ex.name = change.updates.newName || ex.name;
                  if (change.updates.targetSets != null) ex.targetSets = change.updates.targetSets;
                  if (change.updates.targetReps != null) ex.targetReps = change.updates.targetReps;
                  if (change.updates.targetRPE != null) ex.targetRPE = change.updates.targetRPE;
                  if (change.updates.targetWeight != null) ex.targetWeight = change.updates.targetWeight;
                }
                break;
              case 'remove':
                if (exIdx >= 0) {
                  day.exercises.splice(exIdx, 1);
                }
                break;
              case 'add':
                if (change.updates.newExercise) {
                  day.exercises.push({
                    name: change.updates.newExercise.name || change.updates.newName || 'New Exercise',
                    targetSets: change.updates.targetSets || 3,
                    targetReps: change.updates.targetReps || '8-12',
                    targetRPE: change.updates.targetRPE || 8,
                    targetWeight: change.updates.targetWeight,
                  });
                }
                break;
            }
          }
        } catch (e) {
          console.error("Failed to parse iteration changes:", e);
        }
      }

      // Safety check: week count must never decrease
      if (updatedProgram.weeks.length < program.weeks.length) {
        console.warn(`AI iteration tried to reduce weeks from ${program.weeks.length} to ${updatedProgram.weeks.length}. Rejecting.`);
        updatedProgram = structuredClone(program);
      }

      // Update metadata
      updatedProgram.iterationCount = program.iterationCount + 1;
      updatedProgram.lastIteratedAt = Date.now();

      const summary = text.replace(/\[CHANGES\][\s\S]*?\[\/CHANGES\]/, '').trim();
      return { updatedProgram, summary: summary.slice(0, 300) };
    } catch (e) {
      console.error("Program iteration failed:", e);
      return { updatedProgram: program, summary: 'Iteration failed — program unchanged.' };
    }
  }
  // ===== STORY QUEST SYSTEM =====

  async initializeStory(level: number): Promise<{ genre: string; storyBible: string; firstNarrative: string } | null> {
    const prompt = `You are a master storyteller and Dungeon Master creating an epic narrative for a REAL-LIFE RPG game.
    The player is currently Level ${level} out of 10. The story spans 10 years of real life.

    Design an original story with ONE of these genres (pick the most interesting one):
    - Dark Fantasy (Magic, ancient ruins, lost civilizations)
    - Cyberpunk (Future tech, AI rebellion, hackers)
    - Space Opera (Interstellar exploration, alien civilizations, galactic wars)
    - Mythic Journey (Path of a demigod, trials of fate)
    - Supernatural Thriller (Paranormal, urban legends, occult investigation)

    IMPORTANT RULES:
    - The story bible is a SECRET outline spanning Levels 1-10 (each level = 1 major story arc)
    - Each arc has 3-5 key turning points
    - The story must have: a compelling hook, rising tension, a midpoint twist (around Lv5), and an epic climax
    - Include at least 3 possible ending paths depending on the player's moral choices
    - The player's real-life growth (Health, Career, Knowledge, Social) should mirror their character's growth in the story
    - Write all story content, narratives, and mission descriptions in English.

    Return JSON:
    {
      "genre": "the chosen genre name",
      "storyBible": "A detailed 500-800 word secret outline of the entire 10-level story arc, including key characters, turning points, and multiple possible endings. Written in English.",
      "firstNarrative": "A 150-200 word opening narrative that hooks the player into the story world. Mysterious, atmospheric, ends on a cliffhanger or question. Written in English."
    }`;

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: prompt }] },
        config: { responseMimeType: 'application/json' }
      });
      return JSON.parse(response.text || '{}');
    } catch (e) {
      console.error("Story initialization failed:", e);
      return null;
    }
  }

  async generateStoryEvent(
    storyState: StoryState,
    triggerCategory: Category,
    milestone: number,
    playerLevel: number
  ): Promise<{ narrative: string; missionDescription: string; choiceOptions: string[] } | null> {
    // Build context from recent chapters (last 5 full + summary of older)
    const recentChapters = storyState.chapters.slice(-5);
    const recentStr = recentChapters.map(c => 
      `[${c.category}|${c.milestone}XP] ${c.narrative}${c.choiceMade ? ` → Choice: "${c.choiceMade}"` : ''}${c.completed ? ' ✓Completed mission' : ' ✗Not completed'}`
    ).join('\n\n');

    const choicesStr = storyState.choicesMade.slice(-10).map(c => c.summary).join('; ');

    const categoryMapping: Record<string, string> = {
      'Health': 'Physical/Combat/Survival challenges',
      'Career': 'Strategy/Leadership/Resource management',
      'Knowledge': 'Magic/Tech/Puzzles/Knowledge exploration',
      'Family & Socializing': 'Alliances/Diplomacy/Emotion/Community',
    };

    const prompt = `You are the Dungeon Master of an ongoing story-driven life RPG.

    【Story Setting】
    Genre: ${storyState.genre}
    Story Bible (Secret): ${storyState.storyBible}
    
    【Story Progress Summary】
    ${storyState.storySummary || 'The story has just begun.'}

    【Recent Events】
    ${recentStr || 'This is the beginning of the story.'}

    【Player Choice History】
    ${choicesStr || 'No choices made yet'}

    【Current Status】
    Player Level: ${playerLevel}/10 (Arc ${storyState.currentArc})
    Trigger Category: ${triggerCategory} (Represents growth in "${categoryMapping[triggerCategory] || triggerCategory}")
    XP Milestone: ${milestone}
    Events Occurred: ${storyState.chapters.length}

    【Your Task】
    1. Generate a 150-250 word story event in English, responding to the player's ${triggerCategory} growth.
    2. The story must continue the previous narrative, referencing existing characters and events.
    3. Design a relevant real-world mission for the player to complete (safe, positive, fun).
    4. Provide 2-3 story choice options, each leading to different narrative directions.
    
    【Real-world Mission Rules】
    - Must be safe and legal.
    - Should relate to the story context (e.g., story needs courage → real-world mission is saying hi to a stranger).
    - Moderate difficulty, completable in 1-3 days.
    - Examples: Social challenges, reading specific books, exploring new places, learning new skills, acts of kindness, physical challenges, journaling, etc.

    Return JSON:
    {
      "narrative": "Story narrative text (English, 150-250 words, atmospheric, includes dialogue, ends on a hook)",
      "missionDescription": "Real-world mission description (English, clear and specific, 50-100 words)",
      "choiceOptions": ["Choice A description", "Choice B description", "Choice C description"]
    }`;

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: prompt }] },
        config: { responseMimeType: 'application/json' }
      });
      return JSON.parse(response.text || '{}');
    } catch (e) {
      console.error("Story event generation failed:", e);
      return null;
    }
  }

  async summarizeStoryProgress(storyState: StoryState): Promise<string> {
    const allChapters = storyState.chapters.map(c =>
      `[${c.category}] ${c.narrative}${c.choiceMade ? ` (Choice: ${c.choiceMade})` : ''}`
    ).join('\n');

    const prompt = `Summarize the following story events into a concise 200-300 word summary in English.
    Preserve key plot points, character names, important choices, and story consequences.
    This summary will be used as context for generating future story events.

    Genre: ${storyState.genre}
    Story Bible: ${storyState.storyBible}
    
    Events:
    ${allChapters}`;

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: prompt }] },
      });
      return response.text || storyState.storySummary;
    } catch (e) {
      console.error("Story summarization failed:", e);
      return storyState.storySummary;
    }
  }

  async generateStoryImage(narrative: string, genre: string): Promise<string | null> {
    const prompt = `Create a high-quality cinematic illustration for this story segment:
    "${narrative}"
    
    Style: ${genre}
    Atmosphere: Dramatic, epic, detailed.
    Format: 16:9 aspect ratio illustration.
    No text in the image.`;

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: prompt }],
        },
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      return null;
    } catch (e) {
      console.error("Story image generation failed:", e);
      return null;
    }
  }

  async analyzeFoodImage(imageBase64: string, foodName?: string, source: 'restaurant' | 'homemade' = 'homemade'): Promise<SearchFoodResult | null> {
    const prompt = `Analyze this food image. 
    ${foodName ? `The user says this is: "${foodName}".` : ''}
    Source: ${source} (restaurant food usually has higher calories/fat than homemade).
    
    Estimate the nutritional content for the ENTIRE portion shown in the image.
    If multiple items are present, sum them up.
    
    Return valid JSON:
    {
      "name": "Specific Food Name",
      "calories": 123,
      "protein": 10.5,
      "carbs": 20.1,
      "fat": 5.2,
      "servingSize": "1 portion",
      "referenceGrams": 100
    }`;

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: imageBase64.split(',')[1] || imageBase64,
                mimeType: 'image/png',
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
        }
      });

      return JSON.parse(response.text || '{}');
    } catch (e) {
      console.error("Food image analysis failed:", e);
      return null;
    }
  }

  async generateWeeklyReport(
    workoutData: WorkoutData,
    dietData: DietData,
    trendSnapshot: TrendSnapshot,
    aiContext: string
  ): Promise<WeeklyReport | null> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);

    const weekSessions = workoutData.sessions.filter(s => s.timestamp > weekStart.getTime());
    const weekCardio = (workoutData.cardioSessions || []).filter(s => s.timestamp > weekStart.getTime());
    const weekRecovery = (workoutData.recoveryScores || []).filter(s => s.timestamp > weekStart.getTime());

    const totalSets = weekSessions.reduce((s, sess) => s + sess.totalSets, 0);
    const totalVolume = weekSessions.reduce((s, sess) =>
      s + sess.exercises.reduce((ev, ex) => ev + ex.sets.reduce((sv, set) => sv + (set.weight * set.reps), 0), 0), 0);
    const allRPEs = weekSessions.flatMap(s => s.exercises.flatMap(e => e.sets.filter(s => s.rpe).map(s => s.rpe!)));
    const avgRPE = allRPEs.length > 0 ? Math.round((allRPEs.reduce((a,b) => a+b, 0) / allRPEs.length) * 10) / 10 : 0;
    const newPRs = weekSessions.reduce((s, sess) => s + sess.exercises.filter(e => e.isPR).length, 0);

    const cardioMinutes = weekCardio.reduce((s, c) => s + c.durationMinutes, 0);
    const avgReadiness = weekRecovery.length > 0
      ? Math.round((weekRecovery.reduce((s, r) => s + r.overallReadiness, 0) / weekRecovery.length) * 10) / 10 : 0;
    const avgSleepHours = weekRecovery.length > 0
      ? Math.round((weekRecovery.reduce((s, r) => s + r.sleepHours, 0) / weekRecovery.length) * 10) / 10 : 0;

    // Diet compliance
    const dailyLogs = dietData.nutritionData?.dailyLogs || [];
    const weekLogs = dailyLogs.filter(l => {
      const d = new Date(l.date);
      return d >= weekStart && d <= now;
    });
    const targetCal = dietData.currentPlan?.totalCalories || 0;
    const targetPro = dietData.currentPlan?.totalProtein || 0;
    const avgCalories = weekLogs.length > 0
      ? Math.round(weekLogs.reduce((s, l) => s + l.entries.reduce((es, e) => es + e.calories * (e.servings || 1), 0), 0) / weekLogs.length) : 0;
    const avgProtein = weekLogs.length > 0
      ? Math.round(weekLogs.reduce((s, l) => s + l.entries.reduce((es, e) => es + e.protein * (e.servings || 1), 0), 0) / weekLogs.length * 10) / 10 : 0;
    const complianceDays = weekLogs.filter(l => {
      const dayCal = l.entries.reduce((s, e) => s + e.calories * (e.servings || 1), 0);
      return targetCal > 0 && Math.abs(dayCal - targetCal) / targetCal <= 0.1;
    }).length;
    const compliancePct = weekLogs.length > 0 ? Math.round((complianceDays / weekLogs.length) * 100) : 0;

    // Weight
    const bodyLogs = dietData.bodyLogs || [];
    const weekBodyLogs = bodyLogs.filter(l => new Date(l.date) >= weekStart);
    const weightStart = weekBodyLogs.length > 0 ? weekBodyLogs[0].weight : undefined;
    const weightEnd = weekBodyLogs.length > 1 ? weekBodyLogs[weekBodyLogs.length - 1].weight : weightStart;

    const prompt = `# Weekly Training Report Analysis

You are analyzing a week of training data for a bodybuilding/fitness program.

## This Week's Stats:
- Training sessions: ${weekSessions.length} (${totalSets} total sets, ${totalVolume} total volume)
- Avg RPE: ${avgRPE}, New PRs: ${newPRs}
- Cardio: ${weekCardio.length} sessions, ${cardioMinutes} total minutes
- Avg Readiness: ${avgReadiness}/10, Avg Sleep: ${avgSleepHours}h
- Diet: ${avgCalories} avg kcal (target: ${targetCal}), ${avgProtein}g avg protein (target: ${targetPro}g)
- Diet compliance: ${compliancePct}%
${weightStart != null ? `- Weight: ${weightStart}kg → ${weightEnd}kg (${weightEnd && weightStart ? (weightEnd - weightStart > 0 ? '+' : '') + (weightEnd - weightStart).toFixed(1) : 'N/A'}kg)` : ''}

## Trend Context:
${aiContext}

## Training Program:
${workoutData.trainingProgram ? `"${workoutData.trainingProgram.name}", Phase: ${workoutData.trainingProgram.phase}, Week ${workoutData.trainingProgram.currentWeek}/${workoutData.trainingProgram.totalWeeks}` : 'No structured program'}

## Instructions:
1. Provide a concise summary (2-3 sentences) of the week
2. List 3-5 specific, actionable recommendations for next week
3. Note any auto-adjustments that should be made (diet changes, volume changes, cardio changes)

Return JSON:
{
  "summary": "...",
  "recommendations": ["...", "..."],
  "autoAdjustments": ["..."]
}`;

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: prompt }] },
        config: { responseMimeType: 'application/json' }
      });
      const data = JSON.parse(response.text || '{}');

      return {
        id: `wr_${Date.now()}`,
        weekStartDate: weekStart.toISOString().split('T')[0],
        weekEndDate: now.toISOString().split('T')[0],
        timestamp: Date.now(),
        totalSessions: weekSessions.length,
        totalSets,
        totalVolume,
        newPRs,
        avgRPE,
        cardioMinutes,
        cardioSessions: weekCardio.length,
        avgCalories,
        avgProtein,
        dietCompliancePct: compliancePct,
        weightStart,
        weightEnd,
        weightDelta: weightStart && weightEnd ? Math.round((weightEnd - weightStart) * 10) / 10 : undefined,
        avgReadiness,
        avgSleepHours,
        aiSummary: data.summary || '',
        aiRecommendations: data.recommendations || [],
        autoAdjustments: data.autoAdjustments || [],
      };
    } catch (e) {
      console.error('Weekly report generation failed:', e);
      return null;
    }
  }

  async generateRecipeFromIngredients(
    ingredients: string,
    mealType: string,
    targets: { calories: number; protein: number; carbs: number; fat: number }
  ): Promise<{ name: string; ingredients: string[]; instructions: string[]; macros: { calories: number; protein: number; carbs: number; fat: number }; prepTime: string; notes: string }> {
    const perMealCal = Math.round(targets.calories / 3);
    const perMealPro = Math.round(targets.protein / 3);
    const perMealCarb = Math.round(targets.carbs / 3);
    const perMealFat = Math.round(targets.fat / 3);

    const prompt = `You are a nutrition-focused chef. Create a ${mealType} recipe using these available ingredients: ${ingredients}

Macro targets for this meal: ~${perMealCal} kcal, ~${perMealPro}g protein, ~${perMealCarb}g carbs, ~${perMealFat}g fat

Create a practical, delicious recipe that fits these macros. Be specific with quantities.`;

    const response = await this.getAI().models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
            instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
            macros: {
              type: Type.OBJECT,
              properties: {
                calories: { type: Type.NUMBER },
                protein: { type: Type.NUMBER },
                carbs: { type: Type.NUMBER },
                fat: { type: Type.NUMBER },
              },
              required: ['calories', 'protein', 'carbs', 'fat']
            },
            prepTime: { type: Type.STRING },
            notes: { type: Type.STRING },
          },
          required: ['name', 'ingredients', 'instructions', 'macros', 'prepTime']
        }
      }
    });
    return JSON.parse(response.text || '{}');
  }

  async unifiedCoachChat(
    history: { role: 'user' | 'assistant'; text: string }[],
    userMsg: string,
    recentWorkouts: WorkoutSession[],
    dietData: DietData | null,
    staContext?: STAContext,
    aiContext?: string,
    trainingProgram?: TrainingProgram,
    mode: 'coach' | 'design' | 'discuss' = 'coach'
  ): Promise<{ text: string; program?: TrainingProgram; updatedProgram?: TrainingProgram }> {
    const workoutSummary = this.buildWorkoutSummary(recentWorkouts);
    const staSection = this.buildSTAContext(staContext);
    const bodyStats = dietData?.profile
      ? `Body: ${dietData.profile.height}cm, ${dietData.profile.weight}kg${dietData.profile.bodyFat ? `, ${dietData.profile.bodyFat}%BF` : ''}${dietData.profile.muscleMass ? `, ${dietData.profile.muscleMass}kg muscle` : ''}`
      : '';

    let systemPrompt: string;
    if (mode === 'design') {
      systemPrompt = `# Role: Training Program Designer
You are an expert program designer. Design structured training programs based on user goals.
${workoutSummary}
${staSection}
${bodyStats}

When ready to create a program, output it inside [PROGRAM]...[/PROGRAM] tags as valid JSON (fields: name, phase, totalWeeks, daysPerWeek, splitType, specialization, weeks, aiNotes).`;
    } else if (mode === 'discuss' && trainingProgram) {
      const programJSON = JSON.stringify(trainingProgram, null, 2);
      systemPrompt = `# Role: Training Plan Consultant
You are reviewing the user's existing training program.
## CRITICAL RULES:
1. NEVER reset completed days. All "completed: true" fields must remain.
2. Preserve currentWeek and currentDayInWeek unless user explicitly requests change.
3. Preserve program ID, createdAt, iterationCount.
## Current Program:
${programJSON}
${workoutSummary}
${bodyStats}

Explain changes first, then output the FULL updated program inside [PROGRAM_UPDATE]...[/PROGRAM_UPDATE] tags.`;
    } else {
      systemPrompt = `# Role: AI Workout Coach
You are an expert fitness coach with full context of the user's training, diet, and recovery.
${workoutSummary}
${staSection}
${bodyStats}${aiContext ? `\n## Additional Context:\n${aiContext}` : ''}

Answer concisely and practically. Reference specific data when relevant.`;
    }

    const historyText = history.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`).join('\n\n');
    const fullPrompt = `${systemPrompt}\n\n${historyText ? `## Conversation History:\n${historyText}\n\n` : ''}User: ${userMsg}\n\nAssistant:`;

    const response = await this.getAI().models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: fullPrompt }] },
    });
    const text = response.text || '';

    let program: TrainingProgram | undefined;
    let updatedProgram: TrainingProgram | undefined;

    const programMatch = text.match(/\[PROGRAM\]([\s\S]*?)\[\/PROGRAM\]/);
    if (programMatch) {
      try { program = this.normalizeProgram(JSON.parse(programMatch[1])); } catch {}
    }
    const updateMatch = text.match(/\[PROGRAM_UPDATE\]([\s\S]*?)\[\/PROGRAM_UPDATE\]/);
    if (updateMatch) {
      try { updatedProgram = this.normalizeProgram(JSON.parse(updateMatch[1])); } catch {}
    }

    const cleanText = text
      .replace(/\[PROGRAM\][\s\S]*?\[\/PROGRAM\]/g, '[Program ready for review]')
      .replace(/\[PROGRAM_UPDATE\][\s\S]*?\[\/PROGRAM_UPDATE\]/g, '[Plan update ready for review]')
      .trim();

    return { text: cleanText, program, updatedProgram };
  }
}

export const geminiService = new GeminiService();
