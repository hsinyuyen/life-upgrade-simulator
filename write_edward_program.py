"""
Write Edward's 8-week training program to Firebase Firestore.
UID: edward_user_1
Program: 4-day Upper/Lower Split, Mesocycle 8 weeks
"""

import firebase_admin
from firebase_admin import credentials, firestore
import time
import os

# ── Firebase init ───────────────────────────────────────────────────────────
SERVICE_ACCOUNT = os.path.join(os.path.dirname(__file__), "service-account.json")
cred = credentials.Certificate(SERVICE_ACCOUNT)
firebase_admin.initialize_app(cred)
db = firestore.client()

# ── Helpers ─────────────────────────────────────────────────────────────────
def ex(name, exercise_type, sets, reps, rpe, muscles, notes=""):
    """Build a ProgramExercise dict matching the TypeScript interface."""
    d = {
        "name": name,
        "exerciseType": exercise_type,   # 'Primary' | 'Secondary' | 'Isolation'
        "targetSets": sets,
        "targetReps": reps,
        "targetRPE": rpe,
        "targetMuscles": muscles,        # BodyPart[]
    }
    if notes:
        d["notes"] = notes
    return d

def rest_day(day_number):
    return {
        "dayNumber": day_number,
        "label": "Rest Day",
        "bodyParts": [],
        "exercises": [],
        "completed": False,
    }

# ── Exercise Definitions ─────────────────────────────────────────────────────

def day1_upper_a(deload=False):
    """Upper A — Push & Shoulders"""
    sets_mod = 2 if deload else 1   # deload: reduce by ~1 set
    rpe_mod  = -1 if deload else 0
    def s(n): return max(1, n - (1 if deload else 0))

    exercises = [
        # Chest
        ex("Incline Machine Press",         "Primary",   s(3), "10-12", 7+rpe_mod, ["chest"],    "上胸；避免過度前傾壓脊椎"),
        ex("Flat Machine Press",             "Primary",   s(3), "10-12", 7+rpe_mod, ["chest"],    "中胸；保持肩胛後縮"),
        ex("Machine Dip / Decline Press",   "Secondary", s(3), "10-12", 7+rpe_mod, ["chest"],    "下胸；機器版本取代自由重量"),
        # Shoulders (主要加強)
        ex("Seated Overhead Press",         "Primary",   s(4), "10-12", 8+rpe_mod, ["shoulder"], "前三角；機器或啞鈴均可"),
        ex("Lateral Raise",                 "Isolation", s(4), "15-20", 8+rpe_mod, ["shoulder"], "中三角；輕重量高次數"),
        ex("Face Pull",                     "Isolation", s(3), "15-20", 7+rpe_mod, ["shoulder"], "後三角；保持外旋"),
        # Triceps
        ex("Tricep Pushdown",               "Isolation", s(3), "12-15", 7+rpe_mod, ["arm"],      "三頭；繩索下壓"),
        ex("Overhead Tricep Extension",     "Isolation", s(3), "12-15", 7+rpe_mod, ["arm"],      "三頭長頭；繩索或啞鈴均可"),
    ]
    return {
        "dayNumber": 1,
        "label": "Upper A — Push & Shoulders",
        "bodyParts": ["chest", "shoulder", "arm"],
        "exercises": exercises,
        "completed": False,
    }

def day2_lower_a(deload=False):
    """Lower A"""
    rpe_mod = -1 if deload else 0
    def s(n): return max(1, n - (1 if deload else 0))

    exercises = [
        ex("Leg Press",              "Primary",   s(4), "10-12", 8+rpe_mod, ["leg"],  "股四頭/臀；腳寬距"),
        ex("Leg Extension",          "Isolation", s(3), "12-15", 7+rpe_mod, ["leg"],  "股四頭孤立"),
        ex("Lying Leg Curl",         "Primary",   s(4), "10-12", 8+rpe_mod, ["leg"],  "股二頭"),
        ex("Hip Thrust Machine",     "Primary",   s(3), "12-15", 8+rpe_mod, ["leg"],  "臀大肌；機器版取代槓鈴"),
        ex("Calf Raise Machine",     "Isolation", s(4), "15-20", 8+rpe_mod, ["leg"],  "小腿；慢速離心"),
        ex("Cable Crunch",           "Isolation", s(3), "15-20", 7+rpe_mod, ["core"], "腹肌；繩索跪姿"),
    ]
    return {
        "dayNumber": 2,
        "label": "Lower A — Quads, Hamstrings & Glutes",
        "bodyParts": ["leg", "core"],
        "exercises": exercises,
        "completed": False,
    }

def day4_upper_b(deload=False):
    """Upper B — Pull & Shoulders"""
    rpe_mod = -1 if deload else 0
    def s(n): return max(1, n - (1 if deload else 0))

    exercises = [
        # Back
        ex("Lat Pulldown Wide Grip",    "Primary",   s(4), "10-12", 8+rpe_mod, ["back"],     "背闊肌；寬握"),
        ex("Close Grip Pulldown",       "Secondary", s(3), "10-12", 7+rpe_mod, ["back"],     "大圓肌；V-bar 握法"),
        ex("Seated Cable Row",          "Primary",   s(4), "10-12", 8+rpe_mod, ["back"],     "背闊肌/中背；保持脊椎中立"),
        ex("Back Extension Machine",    "Isolation", s(3), "12-15", 7+rpe_mod, ["back"],     "豎脊肌；機器版，避免槓鈴硬舉"),
        ex("Machine Shrug",             "Isolation", s(3), "12-15", 8+rpe_mod, ["back"],     "斜方肌；頂峰收縮保持1秒"),
        # Shoulders
        ex("Reverse Pec Deck",          "Isolation", s(4), "15-20", 8+rpe_mod, ["shoulder"], "後三角"),
        ex("Lateral Raise",             "Isolation", s(4), "15-20", 8+rpe_mod, ["shoulder"], "中三角"),
        # Biceps & Forearms
        ex("EZ Bar Curl",               "Primary",   s(3), "10-12", 7+rpe_mod, ["arm"],      "二頭"),
        ex("Hammer Curl",               "Secondary", s(3), "12-15", 7+rpe_mod, ["arm"],      "二頭肱肌/前臂"),
        ex("Wrist Curl",                "Isolation", s(3), "15-20", 7+rpe_mod, ["arm"],      "前臂屈肌"),
    ]
    return {
        "dayNumber": 4,
        "label": "Upper B — Pull & Shoulders",
        "bodyParts": ["back", "shoulder", "arm"],
        "exercises": exercises,
        "completed": False,
    }

def day5_lower_b(deload=False):
    """Lower B + Core"""
    rpe_mod = -1 if deload else 0
    def s(n): return max(1, n - (1 if deload else 0))

    exercises = [
        ex("Hack Squat Machine",        "Primary",   s(4), "10-12", 8+rpe_mod, ["leg"],  "股四頭；機器版，脊椎無直接負重"),
        ex("Single Leg Press",          "Secondary", s(3), "12",    7+rpe_mod, ["leg"],  "單腳，左右各做；平衡訓練"),
        ex("Seated Leg Curl",           "Primary",   s(4), "10-12", 8+rpe_mod, ["leg"],  "股二頭"),
        ex("Glute Kickback Machine",    "Isolation", s(3), "12-15", 7+rpe_mod, ["leg"],  "臀大肌"),
        ex("Calf Raise",                "Isolation", s(4), "15-20", 8+rpe_mod, ["leg"],  "小腿"),
        ex("Hanging Leg Raise",         "Isolation", s(3), "12-15", 7+rpe_mod, ["core"], "下腹"),
        ex("Cable Woodchop",            "Isolation", s(3), "12",    7+rpe_mod, ["core"], "斜腹/核心；左右各做"),
    ]
    return {
        "dayNumber": 5,
        "label": "Lower B + Core",
        "bodyParts": ["leg", "core"],
        "exercises": exercises,
        "completed": False,
    }

def day6_optional(deload=False):
    """Day 6 — Optional: Shoulders & Arms"""
    rpe_mod = -1 if deload else 0
    def s(n): return max(1, n - (1 if deload else 0))

    exercises = [
        ex("Arnold Press",              "Primary",   s(4), "10-12", 8+rpe_mod, ["shoulder"], "前/中三角"),
        ex("Cable Lateral Raise",       "Isolation", s(4), "15-20", 8+rpe_mod, ["shoulder"], "中三角"),
        ex("Rear Delt Fly",             "Isolation", s(3), "15-20", 7+rpe_mod, ["shoulder"], "後三角"),
        ex("Front Raise",               "Isolation", s(3), "12-15", 7+rpe_mod, ["shoulder"], "前三角"),
        ex("Preacher Curl",             "Primary",   s(3), "10-12", 7+rpe_mod, ["arm"],      "二頭短頭"),
        ex("Incline Dumbbell Curl",     "Secondary", s(3), "10-12", 7+rpe_mod, ["arm"],      "二頭長頭；啞鈴斜板"),
        ex("Close Grip Machine Press",  "Primary",   s(3), "10-12", 7+rpe_mod, ["arm"],      "三頭"),
        ex("Reverse Curl",              "Isolation", s(3), "12-15", 7+rpe_mod, ["arm"],      "前臂伸肌"),
    ]
    return {
        "dayNumber": 6,
        "label": "Optional — Shoulders & Arms",
        "bodyParts": ["shoulder", "arm"],
        "exercises": exercises,
        "completed": False,
    }

# ── Build 8 Weeks ────────────────────────────────────────────────────────────
# Deload weeks: 5 and 8
DELOAD_WEEKS = {5, 8}

# Volume levels
def volume_level(week_num):
    if week_num in DELOAD_WEEKS:
        return "deload"
    if week_num <= 2:
        return "moderate"
    if week_num <= 4:
        return "high"
    return "high"  # week 6-7 are peak

def build_week(week_num):
    deload = week_num in DELOAD_WEEKS
    days = [
        day1_upper_a(deload),
        day2_lower_a(deload),
        rest_day(3),
        day4_upper_b(deload),
        day5_lower_b(deload),
        day6_optional(deload),
        rest_day(7),
    ]
    return {
        "weekNumber": week_num,
        "isDeload": deload,
        "volumeLevel": volume_level(week_num),
        "days": days,
    }

weeks = [build_week(w) for w in range(1, 9)]

# ── TrainingProgram ──────────────────────────────────────────────────────────
now_ms = int(time.time() * 1000)

training_program = {
    "id": "edward-upper-lower-8wk",
    "name": "Edward 8-Week Upper/Lower Mesocycle",
    "phase": "Cut",
    "totalWeeks": 8,
    "daysPerWeek": 4,
    "splitType": "Upper/Lower",
    "specialization": ["shoulder"],
    "weeks": weeks,
    "createdAt": now_ms,
    "aiNotes": (
        "專為 Edward 設計：\n"
        "1. 完全避開硬舉/深蹲，以機器替代所有脊椎負重動作\n"
        "2. 肩膀加強：每次上半身訓練包含前/中/後三角，週六選擇性專項肩膀日\n"
        "3. 漸進超負荷：每週嘗試增加 1 rep 或 2.5kg\n"
        "4. Deload：第 5 週和第 8 週降量（減1組、RPE -1）\n"
        "5. 目標：減脂 + 追求自然體型極限，Phase = Cut"
    ),
    "currentWeek": 1,
    "currentDayInWeek": 1,
    "iterationCount": 0,
}

# ── Write to Firestore ───────────────────────────────────────────────────────
UID = "edward_user_1"
user_ref = db.collection("users").document(UID)

print(f"Writing training program to users/{UID} ...")
user_ref.set(
    {"workoutData": {"trainingProgram": training_program}},
    merge=True,
)
print("Write complete.")

# ── Verify ───────────────────────────────────────────────────────────────────
print("\nVerifying ...")
doc = user_ref.get()
if not doc.exists:
    print("ERROR: document does not exist!")
else:
    data = doc.to_dict()
    prog = data.get("workoutData", {}).get("trainingProgram", {})
    print(f"  id:           {prog.get('id')}")
    print(f"  name:         {prog.get('name')}")
    print(f"  phase:        {prog.get('phase')}")
    print(f"  totalWeeks:   {prog.get('totalWeeks')}")
    print(f"  daysPerWeek:  {prog.get('daysPerWeek')}")
    print(f"  splitType:    {prog.get('splitType')}")
    print(f"  specialization: {prog.get('specialization')}")
    print(f"  weeks count:  {len(prog.get('weeks', []))}")
    for w in prog.get("weeks", []):
        days = w.get("days", [])
        training_days = [d for d in days if d.get("exercises")]
        print(f"  Week {w['weekNumber']:2d} | deload={w['isDeload']} | volume={w['volumeLevel']:8s} | training days={len(training_days)}")
    print("\nDone! Program successfully written to Firebase.")
