
import { GoogleGenAI, Type } from "@google/genai";
import { Category, GeminiAnalysisResponse, EmergencyApprovalResponse, UserStats, DietProfile, BodyLog, DietPlan, Recipe, WorkoutSession, DietData, StoryState, StoryChapter, CharacterSkin, TrainingCycle, TrainingPhase, ExerciseType, E1RMEntry, BodyPart, TrainingProgram, ProgramDay, SavedExercise, PHASE_CONFIG } from "../types";

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

    Create exactly 4-6 recipes (covering breakfast, lunch, dinner, and 1-2 snacks).
    Also generate a consolidated grocery list from all recipes.
    Calculate appropriate macros for the goal.
    Include an "aiNotes" field with brief dietary advice${workoutData?.trainingProgram ? ' that references how the diet supports the current training phase' : ''}.

    IMPORTANT: Return valid JSON matching this exact structure:
    {
      "recipes": [{ "name": "...", "mealType": "breakfast|lunch|dinner|snack", "ingredients": ["item1", "item2"], "instructions": "step by step...", "calories": 500, "protein": 30, "carbs": 50, "fat": 15, "servings": 1 }],
      "groceryList": [{ "name": "Chicken Breast", "amount": "500g", "category": "Protein" }],
      "totalCalories": 2200,
      "totalProtein": 160,
      "totalCarbs": 220,
      "totalFat": 70,
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
      return {
        id: Math.random().toString(36).substr(2, 9),
        createdAt: Date.now(),
        recipes: (data.recipes || []).map((r: any, i: number) => ({
          ...r,
          id: `recipe-${Date.now()}-${i}`,
          servings: r.servings || 1,
        })),
        groceryList: data.groceryList || [],
        totalCalories: data.totalCalories || 0,
        totalProtein: data.totalProtein || 0,
        totalCarbs: data.totalCarbs || 0,
        totalFat: data.totalFat || 0,
        aiNotes: data.aiNotes || '',
      };
    } catch (e) {
      console.error("Diet plan generation failed:", e);
      return null;
    }
  }

  async analyzeDietProgress(profile: DietProfile, bodyLogs: BodyLog[], currentPlan: DietPlan | null): Promise<{ analysis: string; suggestedChanges: string[]; newPlan: DietPlan | null }> {
    const sortedLogs = [...bodyLogs].sort((a, b) => a.date.localeCompare(b.date));
    const logsStr = sortedLogs.map(l => 
      `${l.date}: ${l.weight}kg${l.bodyFat ? `, ${l.bodyFat}% BF` : ''}${l.muscleMass ? `, ${l.muscleMass}kg muscle` : ''}`
    ).join('\n');

    const planStr = currentPlan 
      ? `Current plan: ${currentPlan.totalCalories}kcal, ${currentPlan.totalProtein}g protein, ${currentPlan.totalCarbs}g carbs, ${currentPlan.totalFat}g fat. Meals: ${currentPlan.recipes.map(r => r.name).join(', ')}`
      : 'No current plan';

    const prompt = `You are an expert nutritionist analyzing body composition progress.

    Profile: Height ${profile.height}cm, Goal: ${profile.goal}
    Preferences: ${profile.preferences || 'None'}

    Body Data History:
    ${logsStr || 'No data yet'}

    ${planStr}

    Analyze the progress data and provide:
    1. A brief analysis of the trends (weight, body fat, muscle changes)
    2. 3-5 specific suggested changes to the diet
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
    staContext?: STAContext
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

  // ===== STA v2: Program Iteration (Post-Session Auto-Adjust) =====

  async iterateProgram(
    program: TrainingProgram,
    completedSession: WorkoutSession,
    plannedDay: ProgramDay,
    staContext: STAContext
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

    const prompt = `# Role: Program Iteration Engine

You are reviewing a completed training session and adjusting the REMAINING program accordingly.

## Current Program: "${program.name}" (${program.splitType}, ${program.phase})
Week ${program.currentWeek} of ${program.totalWeeks} | ${remainingWeeks} weeks remaining

## Today's Performance vs Plan:
${comparisonLines}

${staSection}

## Iteration Rules:
1. **Minor adjust (default)**: If actual is close to plan, apply standard double progression to the NEXT session that uses these exercises. Increase weight if all sets hit top of rep range at RPE<=9.
2. **Exercise swap**: If an exercise missed targets for 2+ consecutive sessions, suggest replacing with an equivalent movement. Include the swap in your changes.
3. **Structural change**: If overall fatigue >7 or a muscle's fatigue >8, consider:
   - Inserting an early deload (move planned deload forward)
   - Reducing sets for fatigued muscles in upcoming weeks
   - Extending the mesocycle by 1 week if needed
4. **Phase awareness**: During Cut, do NOT increase volume. During Bulk, can add sets if fatigue allows.

## Output Format:
Return your analysis and then the FULL updated program (all weeks, including completed ones) inside [PROGRAM_JSON]...[/PROGRAM_JSON] tags.
Mark completed days as completed=true, completedSessionId set, completedAt set.
Only modify FUTURE uncompleted days/weeks. Keep completed data unchanged.
Include a brief 1-2 sentence summary of what you changed.`;

    try {
      const response = await this.getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: prompt }] },
      });
      const text = response.text || '';

      const jsonMatch2 = text.match(/\[PROGRAM_JSON\]([\s\S]*?)\[\/PROGRAM_JSON\]/);
      let updatedProgram = program;
      if (jsonMatch2) {
        try {
          const parsed = JSON.parse(jsonMatch2[1]);
          const normalized = this.normalizeProgram(parsed);
          // Merge completed status from original program to prevent AI from losing it
          const mergedWeeks = normalized.weeks.map((nw, wi) => {
            const origWeek = program.weeks[wi];
            if (!origWeek) return nw;
            return {
              ...nw,
              days: nw.days.map((nd, di) => {
                const origDay = origWeek.days[di];
                if (origDay?.completed) {
                  return { ...nd, completed: true, completedSessionId: origDay.completedSessionId, completedAt: origDay.completedAt };
                }
                return nd;
              }),
            };
          });
          // Recalculate current position from merged data
          let calcWeek = 1;
          let calcDay = 1;
          for (const w of mergedWeeks) {
            const uncompletedIdx = w.days.findIndex(d => !d.completed);
            if (uncompletedIdx >= 0) {
              calcWeek = w.weekNumber;
              calcDay = uncompletedIdx + 1;
              break;
            }
          }
          updatedProgram = {
            ...normalized,
            weeks: mergedWeeks,
            id: program.id,
            createdAt: program.createdAt,
            currentWeek: calcWeek,
            currentDayInWeek: calcDay,
            iterationCount: program.iterationCount + 1,
            lastIteratedAt: Date.now(),
          };
        } catch (e) {
          console.error("Failed to parse iteration JSON:", e);
        }
      }

      const summary = text.replace(/\[PROGRAM_JSON\][\s\S]*?\[\/PROGRAM_JSON\]/, '').trim();
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
}

export const geminiService = new GeminiService();
