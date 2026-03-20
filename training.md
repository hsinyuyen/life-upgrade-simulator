🛠️ Smart Training Architect (STA) 開發說明書
1. 系統架構圖 (System Architecture)
系統由 Logic Core (硬性規則引擎) 與 LLM Reasoning Layer (軟性決策層) 組成。

Logic Core: 負責處理「雙重進階法」與「1RM 計算」等數學模型。

LLM Layer: 負責解析用戶的「主觀感受（如：今天好累、肩膀有點酸）」並對 Logic Core 的建議進行微調。

2. 核心演算法 (Python Implementation)
這段程式碼定義了系統如何處理「進階」與「減載」的邏輯。

Python
import math

class TrainingEngine:
    def __init__(self, phase="Recomp", volume_multiplier=1.0):
        self.phase = phase  # Bulk, Cut, Recomp
        self.volume_multiplier = volume_multiplier

    def calculate_e1rm(self, weight, reps):
        """計算預估 1RM (Brzycki Formula)"""
        if reps == 1: return weight
        return weight * (36 / (37 - reps))

    def get_next_step(self, exercise_type, history):
        """
        雙重進階邏輯判斷
        history: 包含最近一次 [weight, reps, rpe, sets] 的字典
        """
        w, r, rpe, s = history['weight'], history['reps'], history['rpe'], history['sets']
        target_r_max = 12 if exercise_type == "Isolation" else 8
        increment = 1.0 if exercise_type == "Isolation" else 2.5

        # 1. 判斷是否減載 (Deload Trigger)
        if rpe >= 10 or history.get('fatigue_score', 0) > 8:
            return {"action": "DELOAD", "weight": w * 0.8, "sets": math.ceil(s * 0.5), "reason": "High Fatigue Detected"}

        # 2. 雙重進階邏輯 (Double Progression)
        if r >= target_r_max and rpe <= 9:
            # 次數達標且強度尚可 -> 增加重量，回到低次數區間
            return {"action": "INCREASE_WEIGHT", "weight": w + increment, "reps": target_r_max - 4, "reason": "Target Reps Met"}
        
        elif rpe <= 7:
            # 強度過低 -> 增加次數或組數
            return {"action": "INCREASE_REPS", "weight": w, "reps": r + 1, "reason": "Intensity too low"}

        return {"action": "MAINTAIN", "weight": w, "reps": r, "reason": "Continue Progressive Overload"}

# 範例執行
engine = TrainingEngine(phase="Bulk")
last_session = {'weight': 100, 'reps': 8, 'rpe': 8, 'sets': 4, 'fatigue_score': 3}
suggestion = engine.get_next_step("Compound", last_session)
print(f"Next Session Suggestion: {suggestion}")
3. LLM 開發指南 (Prompt Engineering Spec)
當你將此系統整合至 LLM（如 Gemini 或 GPT-4）時，請使用以下結構化 Prompt 框架。

🏗️ System Prompt 範本
Markdown
# Role: 專業健美教練與數據分析師

## Context: 
你負責監督用戶的訓練數據。系統會提供「Logic Core」生成的數學建議，你的任務是結合用戶的「生理狀態」與「主觀回饋」進行最後修訂。

## Decision Rules:
1. **RPE 校準**: 如果用戶回報 "感覺很輕鬆" 但 RPE 輸入為 9，請質疑其 RPE 準確性並微調建議。
2. **傷病規避**: 如果用戶提到任何 "關節痛" (非肌肉酸痛)，強制將該動作替換為等效的機器動作，或觸發該部位的局部減載。
3. **心理激勵**: 在 Bulk 期間，鼓勵挑戰重量；在 Cut 期間，強調維持重量與動作控制。

## Output Format (JSON):
{
  "status": "Proceed/Deload/Adjust",
  "adjustment_logic": "String explaining the why",
  "prescribed_workout": {
    "exercise": "Name",
    "target_load": "Weight in kg",
    "target_reps": "Range",
    "rpe_target": "Integer"
  }
}
4. 數據架構設計 (Data Schema)
為了讓 LLM 能長期追蹤你的進度，建議的 JSON 存儲格式如下：

JSON
{
  "user_id": "001",
  "current_cycle": {
    "week": 4,
    "phase": "Bulk",
    "specialization_focus": "Lateral Delts",
    "accumulated_fatigue": 65.5
  },
  "exercise_history": [
    {
      "name": "Barbell Bench Press",
      "data": [
        {"date": "2024-05-01", "load": 100, "reps": 8, "rpe": 9, "e1rm": 124},
        {"date": "2024-05-08", "load": 102.5, "reps": 6, "rpe": 8, "e1rm": 127}
      ]
    }
  ]
}
5. 開發路徑圖 (Roadmap)
Phase 1 (MVP): 建立 Excel/Notion 模板，手動輸入數據，使用 Python Script 計算下一週重量。

Phase 2 (LLM Integration): 串接 API，將上一週的訓練總結傳給 LLM，讓它根據你的「心情」與「疲勞感」生成對話式建議。

Phase 3 (Auto-specialization): 系統自動偵測各部位 e1RM 增長率，若某部位連續 4 週增長率低於平均值，自動將該部位判定為「弱項」，並在下個週期增加容量。