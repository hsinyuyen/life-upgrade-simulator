import pandas as pd
import json
import os

def extract_game_data(file_path):
    if not os.path.exists(file_path):
        return {"error": "File not found"}
    
    xl = pd.ExcelFile(file_path)
    
    # 1. 提取積分系統與分類
    points_system = []
    if 'PointsSystem' in xl.sheet_names:
        df = pd.read_excel(file_path, sheet_name='PointsSystem')
        # 根據分析，Item 在 Unnamed: 8，Category 在 Unnamed: 4
        # 我們尋找包含具體任務的行
        if 'Unnamed: 8' in df.columns and 'Unnamed: 4' in df.columns:
            items = df[['Unnamed: 8', 'Unnamed: 4', 'Unnamed: 5']].dropna(subset=['Unnamed: 8'])
            for _, row in items.iterrows():
                item_name = str(row['Unnamed: 8'])
                if item_name and item_name != 'Item' and not item_name.startswith('Unnamed'):
                    points_system.append({
                        "item": item_name,
                        "category": str(row['Unnamed: 4']),
                        "base_points": row['Unnamed: 5'] if pd.notnull(row['Unnamed: 5']) else 10
                    })

    # 2. 提取每日慣例 (Night & Morning Routine)
    routines = []
    if 'Night&MorningRoutine' in xl.sheet_names:
        df = pd.read_excel(file_path, sheet_name='Night&MorningRoutine')
        # 假設第一列是任務名稱
        first_col = df.columns[0]
        routine_items = df[first_col].dropna()
        for item in routine_items:
            if isinstance(item, str) and len(item) > 2:
                routines.append(item)

    # 3. 提取當前狀態 (從 PointsSystem 獲取總分等)
    stats = {
        "totalPoints": 0,
        "level": 1,
        "coins": 0
    }
    if 'PointsSystem' in xl.sheet_names:
        df = pd.read_excel(file_path, sheet_name='PointsSystem')
        # 嘗試尋找 "Total Points" 關鍵字
        for col in df.columns:
            if df[col].dtype == object:
                match = df[df[col].astype(str).str.contains("Total Points", na=False)]
                if not match.empty:
                    # 假設分數在右邊幾列
                    row_idx = match.index[0]
                    col_idx = df.columns.get_loc(col)
                    try:
                        val = df.iloc[row_idx, col_idx + 1]
                        if pd.notnull(val) and isinstance(val, (int, float)):
                            stats["totalPoints"] = int(val)
                            stats["coins"] = int(val) # 初始金幣等於總分
                            stats["level"] = int(val // 1000) + 1
                    except:
                        pass

    return {
        "points_system": points_system[:30], # 限制數量
        "routines": routines[:20],
        "stats": stats
    }

if __name__ == "__main__":
    data = extract_game_data('Edward DailyRecords.xlsx')
    with open('game_data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("Game data extracted to game_data.json")
