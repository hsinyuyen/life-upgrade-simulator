# MCP Server 開發計劃：健美教練 Agent

## 目標
建立一個本地 MCP (Model Context Protocol) Server，讓 Claude Code 能直接存取 Firebase 中的健身資料，成為一個**全知全能的健美教練 Agent**，具備持久記憶、自動分析、主動調整能力。

---

## 專案背景

### 現有應用程式
- **前端**：React + Vite + Tailwind CSS (TypeScript)
- **後端**：Firebase (Firestore + Auth + Storage)
- **部署**：Firebase Hosting (web) + Capacitor (Android APK)
- **AI**：目前用 Gemini Flash 做 in-app coaching

### Firebase 資料結構
所有用戶資料存在 Firestore `users/{userId}` 單一文件中，使用 `merge: true` 策略。

Firebase 配置：
```
projectId: "morph-lister"
```

文件結構 (`users/{userId}`)：
```json
{
  "stats": { UserStats },
  "activities": [ Activity[] ],
  "questItems": [ QuestItem[] ],
  "dietData": { DietData },
  "workoutData": { WorkoutData },
  "storyState": { StoryState }
}
```

---

## 核心資料型別

### WorkoutData（訓練資料）
```typescript
interface WorkoutData {
  sessions: WorkoutSession[];           // 所有訓練紀錄
  exercisePRs: Record<string, number>;  // 各動作最佳 e1RM
  savedExercises?: SavedExercise[];     // 動作庫
  routines?: WorkoutRoutine[];          // 訓練模板
  currentCycle?: TrainingCycle;         // { week, phase: Bulk|Cut|Recomp, accumulatedFatigue }
  exerciseE1RMs?: Record<string, E1RMEntry[]>;  // 各動作 e1RM 歷史
  trainingProgram?: TrainingProgram;    // 當前訓練計劃（完整 mesocycle）
  iterationLogs?: IterationLog[];       // AI 迭代紀錄
  cardioSessions?: CardioSession[];     // 有氧紀錄
  recoveryScores?: RecoveryScore[];     // 恢復評分紀錄
  weeklyReports?: WeeklyReport[];       // 週報歷史
}
```

### TrainingProgram（訓練計劃 - 最重要的結構）
```typescript
interface TrainingProgram {
  id: string;
  name: string;
  phase: 'Bulk' | 'Cut' | 'Recomp';
  totalWeeks: number;
  daysPerWeek: number;
  splitType: string;                    // e.g. "PPL", "Upper/Lower"
  specialization: BodyPart[];           // 重點加強部位
  weeks: ProgramWeek[];                 // 每週結構
  currentWeek: number;
  currentDayInWeek: number;
  iterationCount: number;
  lastIteratedAt?: number;
  aiNotes: string;
  createdAt: number;
}

interface ProgramWeek {
  weekNumber: number;
  isDeload: boolean;
  volumeLevel: string;                  // "MEV", "MEV+1", "MAV", "Deload"
  days: ProgramDay[];
}

interface ProgramDay {
  dayNumber: number;
  label: string;                        // e.g. "Push A", "Upper B"
  bodyParts: BodyPart[];
  exercises: ProgramExercise[];
  completed?: boolean;                  // ⚠️ 絕對不能被覆蓋
  completedSessionId?: string;
  completedAt?: number;
}

interface ProgramExercise {
  name: string;
  exerciseType: 'Primary' | 'Secondary' | 'Isolation';
  targetSets: number;
  targetReps: string;                   // "4-6", "8-12", "12-15"
  targetRPE: number;
  targetWeight?: number;                // kg
  targetMuscles: BodyPart[];
  notes?: string;
}
```

### WorkoutSession（單次訓練紀錄）
```typescript
interface WorkoutSession {
  id: string;
  date: string;                         // YYYY-MM-DD
  timestamp: number;
  bodyParts: BodyPart[];
  exercises: Exercise[];
  totalSets: number;
  totalXP: number;
  duration?: number;
  notes?: string;
}

interface Exercise {
  id: string;
  name: string;
  sets: ExerciseSet[];
  totalVolume: number;
  xpEarned: number;
  isPR: boolean;
}

interface ExerciseSet {
  weight: number;
  reps: number;
  rpe?: number;
  targetWeight?: number;
  targetReps?: string;
  targetRPE?: number;
}
```

### DietData（飲食資料）
```typescript
interface DietData {
  profile: DietProfile | null;          // { height, weight, muscleMass?, bodyFat?, goal, preferences, tdee?, targetCalories? }
  bodyLogs: BodyLog[];                  // 體重/體脂紀錄 [{ date, weight, bodyFat?, muscleMass? }]
  currentPlan: DietPlan | null;         // 目前飲食計劃（含 recipes, grocery list, macros）
  planHistory: DietPlan[];              // 歷史飲食計劃
  nutritionData?: NutritionData;        // { savedFoods, dailyLogs, macroTargets }
}

interface DailyNutritionLog {
  date: string;
  entries: FoodEntry[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  macroHit: boolean;
}
```

### CardioSession（有氧紀錄）
```typescript
interface CardioSession {
  id: string;
  date: string;
  type: 'LISS' | 'HIIT' | 'Conditioning' | 'Sport';
  activity: string;
  durationMinutes: number;
  caloriesBurned?: number;
  avgHeartRate?: number;
  distanceKm?: number;
  rpe?: number;
}
```

### RecoveryScore（恢復評分）
```typescript
interface RecoveryScore {
  id: string;
  date: string;
  sleepHours: number;
  sleepQuality: number;     // 1-10
  muscleSoreness: number;   // 1-10
  energyLevel: number;      // 1-10
  stressLevel: number;      // 1-10
  overallReadiness: number; // computed
}
```

### BodyPart 類型
```typescript
type BodyPart = 'chest' | 'back' | 'shoulder' | 'arm' | 'leg' | 'core' | 'cardio';
```

---

## MCP Server 架構

### 技術選型
- **Runtime**: Node.js + TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Firebase**: `firebase-admin` (Server SDK，用 service account)
- **Transport**: stdio（Claude Code 標準）

### 目錄結構
```
mcp-bodybuilding-coach/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── firebase.ts           # Firebase Admin SDK init
│   ├── tools/
│   │   ├── training.ts       # 訓練相關 tools
│   │   ├── diet.ts           # 飲食相關 tools
│   │   ├── body.ts           # 身體測量 tools
│   │   ├── program.ts        # 計劃管理 tools
│   │   ├── cardio.ts         # 有氧 tools
│   │   ├── recovery.ts       # 恢復 tools
│   │   ├── analysis.ts       # 趨勢分析 tools
│   │   └── memory.ts         # 教練記憶 tools
│   └── utils/
│       ├── calculations.ts   # e1RM、疲勞、趨勢計算
│       └── formatters.ts     # 資料格式化
└── service-account.json      # Firebase Admin 金鑰（gitignore）
```

---

## MCP Tools 定義

### 1. 訓練資料讀取

#### `get_recent_workouts`
```
描述：取得最近 N 次訓練紀錄
參數：
  - count: number (default 10) - 取幾筆
  - bodyPart?: string - 篩選部位
  - dateFrom?: string - 起始日期
返回：WorkoutSession[] 含完整 sets 資料
```

#### `get_exercise_history`
```
描述：取得特定動作的所有歷史紀錄
參數：
  - exerciseName: string
  - weeks?: number (default 8)
返回：每次做這個動作的日期、組數、重量、次數、RPE、e1RM
```

#### `get_exercise_prs`
```
描述：取得所有動作的 PR 紀錄
返回：{ exercise: string, bestE1RM: number, date: string }[]
```

#### `get_e1rm_trends`
```
描述：取得指定動作的 e1RM 趨勢
參數：
  - exerciseNames?: string[] (不填則取 top 5)
  - weeks?: number (default 12)
返回：每週 e1RM 值，含進步率計算
```

### 2. 訓練計劃管理

#### `get_training_program`
```
描述：取得完整的當前訓練計劃
返回：TrainingProgram 完整結構，含每天的動作和完成狀態
```

#### `update_program_exercises`
```
描述：修改訓練計劃中特定 day 的動作
參數：
  - weekNumber: number
  - dayNumber: number
  - exercises: ProgramExercise[]
⚠️ 安全規則：
  - 不能修改 completed=true 的 day
  - 不能修改 currentWeek/currentDayInWeek
  - 必須保留 id, createdAt, iterationCount
```

#### `add_program_week`
```
描述：在計劃末尾新增一週
參數：
  - weekData: ProgramWeek
  - isDeload?: boolean
```

#### `mark_day_complete`
```
描述：手動標記某天為已完成
參數：
  - weekNumber: number
  - dayNumber: number
⚠️ 會自動重新計算 currentWeek/currentDayInWeek
```

#### `swap_exercise`
```
描述：在未來的訓練中替換特定動作
參數：
  - oldExerciseName: string
  - newExercise: ProgramExercise
  - applyToAllFutureDays: boolean (default true)
⚠️ 只影響未完成的 days
```

### 3. 飲食資料

#### `get_diet_profile`
```
描述：取得飲食 profile 和當前計劃
返回：DietProfile + DietPlan（含 recipes, macros）
```

#### `get_nutrition_logs`
```
描述：取得每日營養攝取紀錄
參數：
  - days?: number (default 7)
返回：DailyNutritionLog[]，含每餐明細和巨量營養素
```

#### `get_diet_compliance`
```
描述：計算飲食計劃的遵從度
參數：
  - weeks?: number (default 4)
返回：{ week, avgCalories, targetCalories, avgProtein, targetProtein, compliancePct }[]
```

#### `update_diet_plan`
```
描述：更新飲食計劃
參數：
  - plan: Partial<DietPlan>
⚠️ merge 方式更新，不會覆蓋未指定的欄位
```

### 4. 身體測量

#### `get_body_logs`
```
描述：取得體重/體脂/肌肉量紀錄
參數：
  - weeks?: number (default 12)
返回：BodyLog[] 含趨勢計算（週平均、月平均、變化率）
```

#### `add_body_log`
```
描述：新增一筆身體測量
參數：
  - weight: number
  - bodyFat?: number
  - muscleMass?: number
  - notes?: string
```

### 5. 有氧資料

#### `get_cardio_sessions`
```
描述：取得有氧紀錄
參數：
  - weeks?: number (default 4)
  - type?: CardioType
返回：CardioSession[]，含每週總時間統計
```

### 6. 恢復資料

#### `get_recovery_scores`
```
描述：取得恢復評分歷史
參數：
  - days?: number (default 14)
返回：RecoveryScore[]，含趨勢和平均值
```

### 7. 綜合分析

#### `analyze_training_trends`
```
描述：全面分析訓練趨勢
返回：
  - e1RM 進步/停滯/退步的動作清單
  - 每個肌群的週 sets 數 vs MEV/MAV
  - 疲勞趨勢
  - 是否需要 deload 的建議
  - 弱點肌群分析
```

#### `analyze_overall_status`
```
描述：取得用戶完整狀態概覽（給 Agent 快速了解全局用）
返回：
  - 當前計劃進度
  - 最近 readiness 分數
  - 這週訓練量 vs 目標
  - 飲食合規度
  - 體重趨勢方向
  - 需要關注的警訊
```

#### `generate_weekly_report`
```
描述：生成本週的完整報告
返回：WeeklyReport 結構（但 aiSummary 和 aiRecommendations 留空，由 Claude 自己填寫）
```

### 8. 教練記憶系統

#### `get_coach_memories`
```
描述：取得所有教練記憶
參數：
  - category?: 'injury' | 'preference' | 'insight' | 'goal' | 'note'
返回：CoachMemory[]
```

#### `write_coach_memory`
```
描述：寫入一條教練記憶
參數：
  - category: 'injury' | 'preference' | 'insight' | 'goal' | 'note'
  - content: string
  - relatedExercises?: string[]
  - relatedBodyParts?: BodyPart[]
  - importance: 'high' | 'medium' | 'low'
```

#### `delete_coach_memory`
```
描述：刪除一條記憶
參數：
  - memoryId: string
```

### 記憶儲存結構（Firebase）
```typescript
// 存在 users/{userId}/coachMemories/{memoryId}
interface CoachMemory {
  id: string;
  category: 'injury' | 'preference' | 'insight' | 'goal' | 'note';
  content: string;
  relatedExercises?: string[];
  relatedBodyParts?: BodyPart[];
  importance: 'high' | 'medium' | 'low';
  createdAt: number;
  updatedAt: number;
}
```

---

## MCP Resources 定義

除了 Tools，也定義 Resources 讓 Claude 能直接讀取：

### `coaching://status`
返回當前訓練/飲食/身體的快速狀態摘要（純文字）。

### `coaching://program`
返回完整訓練計劃的格式化文字版本。

### `coaching://memories`
返回所有教練記憶的格式化列表。

---

## Firebase Admin 設定

### 取得 Service Account Key
1. 到 https://console.firebase.google.com/project/morph-lister/settings/serviceaccounts/adminsdk
2. 點 "Generate new private key"
3. 下載 JSON，存為 `mcp-bodybuilding-coach/service-account.json`
4. 加入 `.gitignore`

### 初始化代碼
```typescript
import admin from 'firebase-admin';
import serviceAccount from '../service-account.json';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

const db = admin.firestore();

// 讀取用戶資料
async function getUserData(userId: string) {
  const doc = await db.collection('users').doc(userId).get();
  return doc.data();
}

// 更新用戶資料（merge）
async function updateUserData(userId: string, data: any) {
  await db.collection('users').doc(userId).set(data, { merge: true });
}
```

### 用戶 ID
需要知道用戶的 Firebase Auth UID。可以：
- 在 MCP server 啟動時以環境變數傳入：`FIREBASE_USER_ID=xxx`
- 或在 Firebase Console → Authentication 頁面查看

---

## Claude Code 設定

### 在 Claude Code settings 中註冊 MCP server

檔案：`~/.claude/settings.json` 或專案層級 `.claude/settings.json`
```json
{
  "mcpServers": {
    "bodybuilding-coach": {
      "command": "node",
      "args": ["path/to/mcp-bodybuilding-coach/dist/index.js"],
      "env": {
        "FIREBASE_USER_ID": "你的 Firebase Auth UID"
      }
    }
  }
}
```

---

## 安全規則（非常重要）

### 寫入保護
1. **永遠不能覆蓋 `completed: true` 的 day** → 檢查原始資料，如果 day 已完成，拒絕修改
2. **永遠不能刪除 sessions** → 只允許新增
3. **更新計劃時用 merge** → 不能整個覆蓋 workoutData
4. **寫入前先讀取** → 確保不會覆蓋其他欄位

### 讀取安全
1. 只存取指定 userId 的資料
2. Service account key 不能 commit 到 git

---

## 實作順序建議

### Phase 1：核心讀取（30 分鐘）
1. 初始化 MCP server + Firebase Admin
2. 實作 `analyze_overall_status`（最重要，讓 Claude 快速了解全局）
3. 實作 `get_training_program`
4. 實作 `get_recent_workouts`
5. 實作 `get_diet_profile` + `get_nutrition_logs`
6. 實作 `get_body_logs`

### Phase 2：分析工具（20 分鐘）
7. 實作 `get_e1rm_trends` + `get_exercise_history`
8. 實作 `analyze_training_trends`
9. 實作 `get_diet_compliance`
10. 實作 `get_recovery_scores` + `get_cardio_sessions`

### Phase 3：寫入工具（20 分鐘）
11. 實作 `update_program_exercises`（含安全檢查）
12. 實作 `swap_exercise`
13. 實作 `mark_day_complete`
14. 實作 `update_diet_plan`
15. 實作 `add_body_log`

### Phase 4：記憶系統（15 分鐘）
16. 建立 coachMemories subcollection
17. 實作 `get_coach_memories` + `write_coach_memory` + `delete_coach_memory`
18. 實作 Resources

### Phase 5：測試
19. 在 Claude Code 中測試所有 tools
20. 驗證寫入安全規則
21. 測試完整的對話流程

---

## 使用範例

設定完成後，在 Claude Code 中直接對話：

**用戶：** 「幫我看看這週訓練狀況，有什麼需要調整的？」

**Claude 的行為：**
1. 呼叫 `analyze_overall_status` → 取得全局狀態
2. 呼叫 `get_recent_workouts(count=5)` → 看最近訓練細節
3. 呼叫 `get_recovery_scores(days=7)` → 看恢復狀態
4. 呼叫 `get_coach_memories` → 看之前記過的注意事項
5. 綜合分析後回覆建議
6. 如需修改計劃 → 呼叫 `update_program_exercises` 或 `swap_exercise`
7. 呼叫 `write_coach_memory` → 記下這次的分析結論

**用戶：** 「我肩膀有點不舒服，OHP 可能要換掉」

**Claude 的行為：**
1. 呼叫 `get_exercise_history(exerciseName="Overhead Press")` → 看歷史
2. 呼叫 `get_coach_memories(category="injury")` → 看是否有肩傷紀錄
3. 建議替代動作（e.g. Landmine Press）
4. 呼叫 `swap_exercise(old="Overhead Press", new={...Landmine Press...})` → 替換
5. 呼叫 `write_coach_memory(category="injury", content="用戶右肩不適，已將 OHP 換成 Landmine Press。持續觀察。")` → 記住

---

## 注意事項

- Firebase Web API key（在 firebase.ts 中的那個）是**前端用的**，不能用於 Admin SDK。需要另外從 Firebase Console 下載 service account key。
- Firestore 中的日期格式統一用 `YYYY-MM-DD` 字串，timestamp 用 Unix milliseconds。
- `cleanDataForFirebase` 會移除 `undefined` 值，MCP server 寫入時也要做同樣處理。
- 所有 BodyPart 值限定為：`'chest' | 'back' | 'shoulder' | 'arm' | 'leg' | 'core' | 'cardio'`
- ExerciseType 限定為：`'Primary' | 'Secondary' | 'Isolation'`
- TrainingPhase 限定為：`'Bulk' | 'Cut' | 'Recomp'`
