# LevelUp Life RPG — 外部整合指南

本文件提供其他 Web App 整合本遊戲經驗值系統所需的一切資訊。

---

## 1. Firebase 專案資訊

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDBQ6qNuK3wnD8tM-YincYL_3OIqrGsvIw",
  authDomain: "morph-lister.firebaseapp.com",
  projectId: "morph-lister",
  storageBucket: "morph-lister.firebasestorage.app",
  messagingSenderId: "943807114477",
  appId: "1:943807114477:web:8b3d4588debf90a76330e4"
};
```

**必要 npm 套件：**
```bash
npm install firebase
```

---

## 2. 認證方式

使用 **Firebase Auth — Email/Password** 登入。  
用戶必須使用與遊戲相同的帳號登入，才能操作同一份資料。

```javascript
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const auth = getAuth(app);
const userCredential = await signInWithEmailAndPassword(auth, email, password);
const uid = userCredential.user.uid; // 用於存取 Firestore 文件
```

---

## 3. Firestore 資料結構

所有用戶資料存放在單一文件：

```
Collection: "users"
Document:   "{uid}"
```

文件結構（僅列出與 XP 相關的欄位）：

```typescript
{
  stats: {
    level: number,            // 目前等級 (1 起)
    healthXP: number,         // 健康經驗值
    careerXP: number,         // 職涯經驗值
    knowledgeXP: number,      // 知識經驗值
    familySocialXP: number,   // 社交經驗值
    xpToNextLevel: number,    // 升級所需 XP (每條 bar 都要達到)
    totalPoints: number,      // 累計總點數
    neurozoidsToday: number,  // 今日累積 XP (扣分活動的額度)
    // ... 其他欄位 (debuff, avatar 等，不需修改)
  },
  activities: [               // 活動紀錄 (最新在最前)
    {
      id: string,
      timestamp: number,      // Date.now()
      description: string,    // 活動說明
      points: number,         // 獲得的 XP
      category: string,       // "Health" | "Career" | "Knowledge" | "Family & Socializing"
      analysis: string,       // 備註文字
    },
    // ...
  ],
  // 以下為其他模組資料，加 XP 時不需動到：
  // questItems, dietData, workoutData, storyState
}
```

---

## 4. XP 類別 (Category)

| Category 值              | 說明     | 對應 stats 欄位     |
|--------------------------|----------|---------------------|
| `"Health"`               | 健康     | `stats.healthXP`    |
| `"Career"`               | 職涯     | `stats.careerXP`    |
| `"Knowledge"`            | 知識     | `stats.knowledgeXP` |
| `"Family & Socializing"` | 社交家庭 | `stats.familySocialXP` |

---

## 5. 升級機制

- **四條 XP bar 全部** 達到 `xpToNextLevel` 時升級
- 升級後各 bar 扣除 `xpToNextLevel`，等級 +1
- XP 門檻依等級遞增：`[1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000]`
- **外部 App 只需加 XP，升級邏輯由主遊戲自動處理**

---

## 6. 加經驗值的標準作法

### 完整範例

```javascript
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = { /* 同上 */ };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/**
 * 為用戶加經驗值
 * @param uid           - Firebase Auth UID
 * @param xp            - 要加的 XP 數值
 * @param category      - "Health" | "Career" | "Knowledge" | "Family & Socializing"
 * @param description   - 活動說明文字
 * @param analysis      - 備註 (可選)
 */
async function addXP(uid, xp, category, description, analysis = '') {
  const userDoc = doc(db, 'users', uid);
  const snap = await getDoc(userDoc);
  
  if (!snap.exists()) {
    throw new Error('User document not found');
  }

  const data = snap.data();
  const stats = { ...data.stats };
  const activities = data.activities || [];

  // 1. 加 XP 到對應的 bar
  const categoryToField = {
    'Health': 'healthXP',
    'Career': 'careerXP',
    'Knowledge': 'knowledgeXP',
    'Family & Socializing': 'familySocialXP',
  };

  const field = categoryToField[category];
  if (!field) throw new Error(`Invalid category: ${category}`);

  stats[field] = (stats[field] || 0) + xp;
  stats.totalPoints = (stats.totalPoints || 0) + xp;
  stats.neurozoidsToday = (stats.neurozoidsToday || 0) + xp;

  // 2. 新增活動紀錄 (最新在最前面)
  const newActivity = {
    id: Math.random().toString(36).slice(2),
    timestamp: Date.now(),
    description: description,
    points: xp,
    category: category,
    analysis: analysis || 'External App XP',
  };

  const newActivities = [newActivity, ...activities];

  // 3. 寫回 Firestore (merge: true 不會覆蓋其他欄位)
  await setDoc(userDoc, {
    stats: stats,
    activities: newActivities,
  }, { merge: true });

  console.log(`Added ${xp} ${category} XP for user ${uid}`);
}
```

### 呼叫範例

```javascript
// 登入
const cred = await signInWithEmailAndPassword(auth, 'user@example.com', 'password');
const uid = cred.user.uid;

// 加 50 點健康 XP
await addXP(uid, 50, 'Health', 'Completed morning run', 'External fitness app');

// 加 30 點知識 XP
await addXP(uid, 30, 'Knowledge', 'Finished coding tutorial', 'LeetCode integration');
```

---

## 7. 注意事項

### 安全性
- 使用 `merge: true` 進行寫入，避免覆蓋其他模組資料
- 先 `getDoc` 讀取最新資料，再基於最新值修改，避免 race condition
- XP 值請用正整數，負數會扣經驗值

### 不要修改的欄位
以下欄位由主遊戲管理，外部 App **不應修改**：
- `stats.level` / `stats.xpToNextLevel` — 升級由主遊戲自動處理
- `stats.dailyDebuff` / `stats.emergencyDebuffs` — Debuff 系統
- `stats.dailyActivityCounts` — 每日活動次數計數
- `questItems` — 任務項目
- `dietData` — 飲食資料
- `workoutData` — 訓練紀錄
- `storyState` — 故事任務狀態

### 資料大小限制
- Firestore 單一文件上限 1MB
- `activities` 陣列會隨時間增長，主遊戲未做分頁裁切
- 每筆 activity 約 200 bytes，正常使用下不會有問題

### 即時同步
- 主遊戲使用 `onSnapshot` 監聽文件變更
- 外部 App 寫入後，主遊戲（如果開著）會**即時自動更新**畫面

---

## 8. 快速整合 Checklist

- [ ] 安裝 `firebase` npm 套件
- [ ] 使用上方 `firebaseConfig` 初始化 Firebase
- [ ] 用 Email/Password 登入取得 `uid`
- [ ] 實作 `addXP()` 函式（參考上方範例）
- [ ] 在適當時機呼叫 `addXP()`，傳入正確的 category
- [ ] 測試：加完 XP 後開啟主遊戲確認數值更新
