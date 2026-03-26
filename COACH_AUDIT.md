# COACH_AUDIT.md — Self Game 健美教練 Agent 功能盤點

> 評估日期：2026-03-26
> 目的：以「頂尖健美教練 Agent」為標準，全面評估現有系統的功能完整度

---

## 一、各檔案摘要

### `components/WorkoutPanel.tsx` — 1904 行

**分頁（5 個）：** `log` | `plan` | `history` | `cardio` | `coach`

**功能列表：**
- **LOG 分頁**：身體部位選擇（7 個：chest/back/shoulder/arm/leg/core/cardio）、動作庫快速載入、組數記錄（重量/次數/RPE）、訓練筆記、完成後 XP 計算
- **PLAN 分頁**：訓練計劃 week-by-week 視圖、按天完成打卡（含日期記錄）、計劃進度百分比、AI 對話式設計（3 個 mode：coach/design/discuss）、pending program 預覽與接受
- **HISTORY 分頁**：過去訓練記錄瀏覽、PR 追蹤
- **CARDIO 分頁**：有氧記錄（LISS/HIIT/Conditioning/Sport）、活動名稱、時間、卡路里、平均心率、距離、RPE
- **COACH 分頁**：AI 文字教練（含 STA context：phase/fatigue/e1RMs/weekly sets）、對話歷史
- **恢復評分**（隱藏在 LOG）：睡眠時數、睡眠品質、肌肉痠痛、能量水平、壓力水平 → overallReadiness 計算
- **動作庫**：SavedExercise（名稱/上次重量/動作類型/目標肌群）+ 訓練模板（WorkoutRoutine）
- **E1RM 追蹤**：Epley formula、歷史趨勢陣列、progression 建議（INCREASE_WEIGHT/INCREASE_REPS/MAINTAIN/DELOAD）
- **疲勞系統**：overallFatigue（0-10）、bodyPartFatigue（每部位 0-10）、weeklyMuscleSets（每肌群組數/週）

**關鍵 UI 元素：**
- 部位選擇 Chip 按鈕、組數增減 +/- 按鈕
- RPE 滑桿（組內）
- Program day 卡片（含 completed 狀態徽章）
- Coach 聊天泡泡介面
- Recovery check-in 表單（sleepHours/sleepQuality/muscleSoreness/energyLevel/stressLevel）

**依賴：** `types`, `geminiService (STAContext)`, `trainingEngine`

---

### `components/DietPanel.tsx` — 1712 行

**分頁（5 個）：** `profile` | `plan` | `grocery` | `logs` | `nutrition`

**功能列表：**
- **PROFILE 分頁**：身高/體重/肌肉量/體脂/目標（bulk/cut/recomp）/飲食偏好、TDEE 顯示、新增體測記錄（weight/BF/muscleMass）
- **PLAN 分頁**：AI 生成飲食計劃（訓練日 + 休息日版本）、食譜列表展開（含材料/做法/宏量）、服份數調整、AI 飲食進度分析（分析體重趨勢並建議更新計劃）、訓練日/休息日切換
- **GROCERY 分頁**：採購清單 + check-off 互動
- **LOGS 分頁**：體重/體脂/肌肉量歷史記錄視覺化
- **NUTRITION 分頁**：
  - 每日食物追蹤（今日攝取量顯示：cal/protein/carbs/fat vs targets）
  - 食物新增方式：條碼掃描（相機 Html5Qrcode）、AI 文字搜尋、手動輸入、AI 照片辨識、已儲存食物
  - 每克調整（adjust grams popup）
  - 宏量素目標設定（min/max range per macro）
  - 歷史記錄瀏覽（過去 dailyLogs）
  - 已儲存食物管理（timesUsed 追蹤）

**依賴：** `types`, `geminiService`, `nutritionService (SearchFoodResult, Html5Qrcode)`

---

### `components/LiveCoach.tsx` — 247 行

**功能：**
- 即時語音對話（Gemini Live API：`gemini-2.5-flash-native-audio-preview-12-2025`）
- System prompt 包含：用戶 level/XP、飲食 profile（height/weight/goal/TDEE）、最近 5 次訓練摘要、當前訓練計劃（名稱/相位/週次）、訓練週期疲勞
- 麥克風輸入（16kHz PCM）→ AI 語音回應（24kHz）
- 轉錄文字顯示
- 語音風格：Puck 聲音
- 按鈕：TALK TO GUIDE / FINISH TALKING

**缺陷：** System prompt 較淺，缺乏：bodyPartFatigue、weeklyMuscleSets、e1RM 歷史、恢復評分

---

### `services/trainingEngine.ts` — 521 行

**所有邏輯：**

| 方法 | 功能 |
|------|------|
| `calculateE1RM(weight, reps)` | Epley formula（weight × 36/(37-reps)） |
| `getBestE1RM(sets)` | 從一組 sets 取最高 e1RM |
| `getNextStep(exerciseType, history)` | 雙進度法：INCREASE_WEIGHT/INCREASE_REPS/MAINTAIN/DELOAD |
| `pickDeloadType(rpe, sets, fatigue)` | 自動判斷 deload 類型（volume/intensity/full） |
| `buildDeload(type, ...)` | 計算 deload 後的重量/組數 |
| `getWeeklyMuscleSetCount(sessions, saved, 7days)` | 每肌群每週硬組數（用 targetMuscles 對應） |
| `calculateBodyPartFatigue(sessions, saved, 7days)` | 每部位疲勞 0-10（基於 RPE × 頻率） |
| `getOverallFatigue(sessions, 7days)` | 整體疲勞 0-10 |
| `getLastExerciseHistory(name, sessions)` | 取某動作最近一次的歷史（weight/reps[]/avgRpe/sets） |
| `computeRecoveryReadiness(score)` | 恢復準備度：sleepQ×0.3 + energyL×0.25 + (10-soreness)×0.25 + (10-stress)×0.2 |
| `buildTrendSnapshot(workoutData, dietData)` | 8 維度趨勢：e1RM/volume/weight/BF/calories/protein/readiness/cardio |
| `getDietCompliance(dietData, 7days)` | 飲食合規率（±10% of target calories） |
| `buildAIContext(workoutData, dietData)` | <500 字的 AI context 摘要（e1RM 方向/volume/體重/合規率/readiness/cardio） |

---

### `services/geminiService.ts` — 1325 行

**AI 功能列表：**

| 方法 | 模型 | 功能 |
|------|------|------|
| `analyzeActivity(desc)` | gemini-3-flash | 生活活動分類 + XP 分配 |
| `approveEmergency(desc)` | gemini-3-flash | 緊急任務審批 |
| `analyzeQuest(name)` | gemini-3-flash | Quest 遊戲屬性生成 |
| `generateAvatar(photo, stats)` | gemini-2.5-flash-image | Pixar 風格頭像生成 |
| `generateCharacterStates(photo, level, theme)` | gemini-2.5-flash-image | 4 狀態角色圖（normal/buff/debuff/both） |
| `generateDietPlan(profile, workoutData?)` | gemini-3-flash | AI 飲食計劃（訓練日 + 休息日，整合訓練相位） |
| `analyzeDietProgress(profile, bodyLogs, plan)` | gemini-3-flash | 飲食進度分析 + 自動建議更新計劃 |
| `workoutCoachAdvice(question, workouts, diet, staCtx)` | gemini-3-flash | 文字 Q&A 教練（含 STA context） |
| `programDesignerChat(history, workouts, diet, sta)` | gemini-3-flash | 對話式 mesocycle 設計（Renaissance Periodization 方法論） |
| `planDiscussionChat(history, program, workouts)` | gemini-3-flash | 修改現有計劃（不重置 completed 狀態） |
| `analyzeFoodImage(imageB64, name?, source)` | gemini-3-flash | AI 食物照片辨識 → 宏量素 |
| `generateWeeklyReport(...)` | gemini-3-flash | 週報 AI 摘要 + 建議 |
| `iterateProgram(...)` | gemini-3-flash | 根據完成的訓練自動迭代調整計劃 |

**教練 AI Prompt 原則（workoutCoachAdvice）：**
- Renaissance Periodization 方法論（MEV/MAV/MRV）
- Exercise tiers（Primary 4-6 / Secondary 8-12 / Isolation 12-15）
- 雙進度法
- 3 種 deload 類型
- Phase 感知（Bulk/Cut/Recomp）
- 傷病判斷（關節痛 ≠ DOMS）

---

### `services/nutritionService.ts` — 131 行

| 方法 | 功能 |
|------|------|
| `lookupBarcode(barcode)` | OpenFoodFacts API 條碼查詢 |
| `searchFood(query)` | Gemini AI 食物搜尋（失敗時 fallback 到 OpenFoodFacts） |
| `analyzeFoodImage(imageB64, name?, source)` | 代理至 geminiService |

---

### `types.ts` — 558 行

**型別分類：**

**遊戲系統：** `UserStats`, `Activity`, `QuestItem`, `DailyDebuff`, `EmergencyDebuff`, `DailyActivityCount`, `NutritionBuff`, `CharacterSkin`, `SkinDecoration`

**飲食：** `BodyLog`, `DietProfile`, `GroceryItem`, `Recipe`, `DietDayPlan`, `DietPlan`, `DietData`, `FoodEntry`, `SavedFood`, `DailyNutritionLog`, `MacroTargets`, `NutritionData`

**訓練：** `BodyPart`, `BODY_PARTS`, `ExerciseType`, `TrainingPhase`, `DeloadType`, `EXERCISE_TIER_CONFIG`, `PHASE_CONFIG`, `ExerciseSet`, `Exercise`, `WorkoutSession`, `ExercisePR`, `SavedExercise`, `WorkoutRoutine`, `TrainingCycle`, `E1RMEntry`, `ProgramExercise`, `ProgramDay`, `ProgramWeek`, `TrainingProgram`, `IterationLog`, `CardioSession`, `RecoveryScore`, `WeeklyReport`, `TrendSnapshot`, `WorkoutData`

**故事：** `StoryChoice`, `StoryChapter`, `StoryState`

**AI 回應：** `GeminiAnalysisResponse`, `EmergencyApprovalResponse`

---

### `App.tsx` — 2311 行

**狀態管理：**
- Firebase Auth + Firestore 單文件持久化（`users/{userId}`）
- 狀態：`stats`, `activities`, `questItems`, `dietData`, `workoutData`, `storyState`
- XP 系統：4 個 bar（healthXP/careerXP/knowledgeXP/familySocialXP），全部達標才升等
- Debuff 系統：每日 debuff（deduction 活動觸發）、緊急任務延遲 debuff
- Nutrition Buff（每日宏量達標 +25% XP）

**面板：** WorkoutPanel, DietPanel, LiveCoach, QuestPanel, StoryPanel, SkinShop, AdminPanel, AvatarSection

**資料流：** App.tsx → Panel props (workoutData/dietData/stats) → onSave callback → Firebase write

---

### `MCP_DEVELOPMENT_PLAN.md` — 規劃中，尚未實作

**計劃架構：** Node.js + TypeScript MCP Server + Firebase Admin SDK

**規劃的 Tools（全部未實作）：**
- 讀取：`get_recent_workouts`, `get_exercise_history`, `get_exercise_prs`, `get_e1rm_trends`, `get_training_program`, `get_diet_profile`, `get_nutrition_logs`, `get_diet_compliance`, `get_body_logs`, `get_cardio_sessions`, `get_recovery_scores`
- 分析：`analyze_training_trends`, `analyze_overall_status`, `generate_weekly_report`
- 寫入：`update_program_exercises`, `swap_exercise`, `mark_day_complete`, `update_diet_plan`, `add_body_log`, `add_program_week`
- 記憶：`get_coach_memories`, `write_coach_memory`, `delete_coach_memory`

**規劃的 CoachMemory 系統（未實作）：**
```
category: 'injury' | 'preference' | 'insight' | 'goal' | 'note'
content: string
relatedExercises?: string[]
relatedBodyParts?: BodyPart[]
importance: 'high' | 'medium' | 'low'
```

---

## 二、頂尖健美教練 Agent 評估框架

---

### A. 作為頂尖健美教練 Agent，必須能做到的事

#### 1. 訓練監控
| 能力 | 說明 |
|------|------|
| 每日訓練計劃 | 清楚告訴用戶今天要練什麼（動作/組數/重量/RPE 目標） |
| 漸進超負荷追蹤 | 每次訓練後判斷該加重還是加次數，有依據的建議 |
| Volume tracking | 每週每肌群組數，對比 MEV/MAV/MRV |
| RPE/RIR 管理 | 記錄主觀強度，與客觀重量對照驗證 |
| Deload 判斷 | 根據疲勞積累、RPE 趨勢、訓練週期判斷 deload 時機 |
| 計劃迭代 | 完成一週後根據實際表現調整下週計劃 |

#### 2. 飲食控制
| 能力 | 說明 |
|------|------|
| 每日熱量/宏量追蹤 | 精確記錄每餐，對比當日目標 |
| 合規率統計 | 過去 7/30 天符合目標的天數比例 |
| 訓練日/休息日差異化 | 訓練日高碳、休息日低碳 |
| 體重趨勢 vs 目標 | 體重變化速度是否符合增肌/減脂計劃 |
| 自動調整建議 | 根據體重趨勢和合規率建議調整熱量/宏量 |

#### 3. 疲勞管理
| 能力 | 說明 |
|------|------|
| 客觀恢復評分 | 睡眠時數/品質、肌肉痠痛、能量、壓力 → 每日 readiness score |
| 肌群疲勞分布 | 知道哪個肌群現在最累，建議訓練順序或減量 |
| Deload 時機判斷 | 達到 MRV、RPE 持續偏高、readiness 持續低下 → 主動建議 deload |
| 積累疲勞趨勢 | 多週的疲勞走向，預防過度訓練 |

#### 4. 身體數據
| 能力 | 說明 |
|------|------|
| 體重趨勢 | 週均體重變化速度（增重 0.5-1kg/月 = 精瘦增肌） |
| 體脂/肌肉量變化 | 身體組成質量判斷 |
| 圍度測量 | 胸圍/腰圍/臀圍/大腿圍/手臂圍（最直接的肌肉增長指標） |
| 進度照片管理 | 定期對比視覺化體型變化 |

#### 5. 迭代能力
| 能力 | 說明 |
|------|------|
| 計劃自動迭代 | 每週完成後，根據 e1RM 趨勢、疲勞、合規率自動調整下週目標重量/組數 |
| 計劃修改對話 | 用戶說「這個動作換掉」、「肩膀不舒服」→ Agent 立刻更新計劃 |
| 偏好學習 | 記住用戶喜歡/討厭的動作、器材限制、生活節律 |

#### 6. 教練記憶
| 能力 | 說明 |
|------|------|
| 傷病記憶 | 哪個部位曾受傷、哪些動作禁止/需替換 |
| 偏好記憶 | 喜歡自由重量還是機器、偏好哪種 split |
| 反應模式記憶 | 這個用戶對哪類訓練反應特別好/差 |
| 目標記憶 | 短期/長期目標、比賽日期、里程碑 |
| 跨對話持久 | 下次對話還記得上次分析的結論 |

---

### B. 現有系統已有的功能（保留）

#### ✅ 訓練監控 — 已有，且品質高
- **每日計劃顯示**：`TrainingProgram` 完整結構，按 week/day 展示，含 target weight/reps/RPE/sets
- **漸進超負荷**：`trainingEngine.getNextStep()` 雙進度法，per exercise type rep range，自動判斷 INCREASE/MAINTAIN/DELOAD
- **E1RM 追蹤**：Epley formula，每動作歷史趨勢陣列 `exerciseE1RMs`，PR 旗幟
- **Volume tracking**：`getWeeklyMuscleSetCount()` 精確到每個 bodyPart，7 天滑動窗口
- **RPE per set**：`ExerciseSet.rpe` 欄位，支援每組個別 RPE
- **Body part fatigue**：`calculateBodyPartFatigue()` 基於 RPE × 頻率，0-10 評分
- **Overall fatigue**：`getOverallFatigue()` 全局疲勞指標
- **Deload 判斷**：`pickDeloadType()` 自動選 volume/intensity/full deload
- **計劃迭代**：`geminiService.iterateProgram()` + `planDiscussionChat()` 修改不重置進度

#### ✅ 飲食控制 — 已有，功能豐富
- **每日食物追蹤**：`DailyNutritionLog`，每餐記錄，即時累計宏量
- **合規率**：`trainingEngine.getDietCompliance()` ±10% 合規度
- **訓練日/休息日計劃**：`DietPlan.restDayPlan` 休息日版本
- **飲食進度 AI 分析**：`geminiService.analyzeDietProgress()` 看體重趨勢，建議調整
- **多種食物輸入**：條碼（OpenFoodFacts）、AI 搜尋（Gemini）、手動、相機掃描、AI 照片辨識
- **宏量目標 min/max range**：`MacroTargets` 結構，判斷 macroHit/exceeded
- **採購清單**：`GroceryItem[]` + check-off

#### ✅ 疲勞管理 — 已有基礎架構
- **恢復評分**：`RecoveryScore` 型別，`computeRecoveryReadiness()` 加權公式
- **主觀 check-in**：sleep hours/quality、muscle soreness、energy、stress
- **恢復趨勢**：`readinessTrend` in TrendSnapshot
- **Cardio 追蹤**：4 種類型（LISS/HIIT/Conditioning/Sport），含心率、距離、卡路里

#### ✅ 身體數據 — 有體重/體脂，無圍度
- **體重記錄**：`BodyLog` 含 weight/bodyFat/muscleMass，歷史視覺化
- **體重趨勢**：`buildTrendSnapshot()` 的 weightTrend/bodyFatTrend

#### ✅ AI 教練 — 高品質
- **文字 Q&A 教練**：`workoutCoachAdvice()` 含完整 STA context（phase/fatigue/e1RM/weeklyMuscle sets）
- **對話式計劃設計**：`programDesignerChat()` 使用 RP 方法論，3 輪對話後產出完整 mesocycle JSON
- **即時語音教練**：`LiveCoach` Gemini Live API，含訓練/飲食 context
- **AI 飲食計劃生成**：整合訓練相位（Bulk 高碳/Cut 高蛋白等）
- **趨勢 AI 摘要**：`buildAIContext()` 精煉 500 字 context 供 AI 使用
- **週報生成**：`WeeklyReport` 型別完整，`generateWeeklyReport()` 方法

#### ✅ 資料架構 — 設計合理
- Firebase 單文件持久化，`merge: true` 策略安全
- `TrendSnapshot` 8 維度趨勢資料結構
- `IterationLog` 追蹤每次 AI 修改計劃的記錄
- `ProgramDay.completed` 防止已完成的訓練被覆蓋
- TypeScript strict types 覆蓋全部結構

---

### C. 現有系統多餘的功能（對健美教練無關，可移除或分離）

> 這些功能是 self_game 的「生活 RPG」系統，對純健美教練 Agent 無關，但不影響健身功能的正確性。如果本專案定位是健美教練 App，以下功能佔用了大量程式碼且分散用戶注意力：

| 功能 | 檔案 | 原因 |
|------|------|------|
| **Story Panel / Quest 故事任務** | `StoryPanel.tsx`, `StoryState` | 生活 RPG 劇情，與訓練無關 |
| **Quest Panel（Career/Knowledge/Family XP）** | `QuestPanel.tsx` | 記錄工作/閱讀/社交活動，不是健美功能 |
| **XP 4-bar 遊戲化系統** | `App.tsx`, `UserStats` | Career/Knowledge/Family XP 與健美無關；Health XP 可保留 |
| **Daily Debuff / Emergency Debuff** | `App.tsx`, `types.ts` | 生活懲罰機制，與訓練疲勞是不同概念 |
| **Neurozoids 虛擬貨幣** | `App.tsx`, `UserStats` | 消費扣分活動的代幣，與健身無關 |
| **Skin Shop + 角色狀態圖生成** | `SkinShop.tsx`, `geminiService` | 娛樂化外觀系統 |
| **Pixar Avatar 生成** | `geminiService.generateAvatar()` | 娛樂功能，佔用大量 AI tokens |
| **Emergency Mission 系統** | `geminiService.approveEmergency()` | 生活緊急任務審批 |
| **ActivityLog（生活活動日誌）** | `ActivityLog.tsx` | 記錄日常生活活動 |
| **LogPoints 每日記錄點數** | `UserStats.logPoints` | 遊戲化打卡獎勵 |
| **NutritionBuff XP 加成** | `NutritionBuff`, `App.tsx` | 把飲食追蹤綁在 XP 系統上，邏輯牽強 |

**程式碼佔比估計：** 以上約佔 App.tsx (2311 行) 的 60%，geminiService.ts (1325 行) 的 40%，是系統最大的「噪音」

---

### D. 缺少的功能（頂尖健美教練需要，但現有系統沒有）

#### 🔴 高優先 — 核心缺失

| 功能 | 現況 | 需要什麼 |
|------|------|---------|
| **教練持久記憶系統** | 規劃在 MCP，但**完全未實作** | `CoachMemory` collection：傷病/偏好/洞察/目標/備忘，跨對話保持 |
| **MCP Server** | 規劃詳細，**完全未建立** | Claude Code 無法直接讀取 Firebase，這是讓 Claude 成為真正教練 Agent 的關鍵 |
| **圍度測量（Circumference）** | BodyLog 只有 weight/BF/muscleMass | 新增 chest/waist/hip/thigh/arm 圍度欄位，是最直接的肌肉增長指標 |
| **計劃自動迭代 UI** | `iterateProgram()` 函數存在，但缺乏 UI 觸發機制 | 完成一次訓練後，自動分析並提示「建議迭代本週計劃」 |

#### 🟡 中優先 — 重要提升

| 功能 | 現況 | 需要什麼 |
|------|------|---------|
| **飲食合規率 Dashboard** | `getDietCompliance()` 有計算，但沒有視覺化 | 週/月合規率趨勢圖、蛋白質/熱量每日達標狀態一覽 |
| **Progress Photo 記錄** | 無 | 定期拍照記錄，附加在 BodyLog 上，可對比查看 |
| **LiveCoach context 強化** | system prompt 較淺（缺 bodyPartFatigue/weeklyMuscle sets/e1RM/recovery） | 把 `buildAIContext()` 的結果注入到 LiveCoach system prompt |
| **訓練計劃 vs 實際執行比較** | 無 | 完成訓練後，比對「計劃目標重量 vs 實際重量」、「目標 RPE vs 實際 RPE」 |
| **Deload 主動警告** | fatigue 計算有，但不主動提示 | 當 overallFatigue > 7 或連續 2 週任一肌群 sets > MAV，顯示 deload 提醒 banner |
| **每日訓練提醒（Today's Plan 首頁 widget）** | 要進 WorkoutPanel → PLAN 才能看 | 在主畫面直接顯示今天的訓練計劃（哪天/哪些動作/預計目標重量） |

#### 🟢 低優先 — 進階功能

| 功能 | 現況 | 需要什麼 |
|------|------|---------|
| **碳水循環（Carb Cycling）追蹤** | 有訓練日/休息日飲食計劃，但無執行記錄分析 | 自動對比「訓練日攝取 vs 休息日攝取」的一致性 |
| **HRV 整合** | 只有主觀恢復評分 | 整合 Apple Health / Garmin 等客觀 HRV 數據 |
| **補充劑記錄** | 無 | 肌酸/蛋白粉/維生素等每日記錄 |
| **比賽準備模式（Peak Week）** | 無 | 比賽前 1-2 週特殊飲食/訓練計劃 |
| **目標達成預測** | 無 | 根據目前進步速度預測「何時能達成目標體重/體脂/e1RM」 |
| **週報自動生成 + 推送** | `generateWeeklyReport()` 存在，但無自動觸發 | 每週一自動生成上週報告，通知用戶 |

---

## 三、總結評分

| 維度 | 完成度 | 說明 |
|------|--------|------|
| 訓練監控 | ⭐⭐⭐⭐☆ 80% | 計劃設計、漸進超負荷、fatigue tracking 都有，缺計劃 vs 實際對比、deload 主動提醒 |
| 飲食控制 | ⭐⭐⭐⭐☆ 75% | 追蹤功能豐富，缺合規率 Dashboard、碳水循環分析 |
| 疲勞管理 | ⭐⭐⭐☆☆ 60% | 架構完整但 UI 曝光不足，恢復評分 buried in WorkoutPanel，缺主動警告 |
| 身體數據 | ⭐⭐⭐☆☆ 55% | 體重/體脂有了，缺圍度測量、進度照片 |
| 迭代能力 | ⭐⭐⭐☆☆ 55% | planDiscussionChat 很好，但 iterateProgram UI 不明確，無自動觸發 |
| 教練記憶 | ⭐☆☆☆☆ 15% | 型別設計完整但完全未實作，是最大缺口 |
| **整體** | **⭐⭐⭐☆☆ 63%** | 底層架構紮實，AI 教練品質高，但關鍵的記憶系統（MCP）是最大缺口 |

---

## 四、下一步建議優先順序

```
Phase 1（最關鍵）：
  → 建立 MCP Server（mcp-bodybuilding-coach）
  → 實作 CoachMemory 系統（Firebase subcollection）
  → 實作 analyze_overall_status tool

Phase 2（重要提升）：
  → 在 BodyLog 新增圍度欄位（chest/waist/hip/thigh/arm）
  → LiveCoach system prompt 強化（注入 bodyPartFatigue/weeklyMuscle sets/e1RM/recovery）
  → 飲食合規率 Dashboard UI（週/月視覺化）

Phase 3（體驗優化）：
  → 主畫面「Today's Training Plan」widget
  → Deload 主動警告 banner（fatigue > 7 時）
  → 計劃 vs 實際執行對比視圖
  → Progress Photo 記錄功能
```
