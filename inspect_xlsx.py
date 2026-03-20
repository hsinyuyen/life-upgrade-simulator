import pandas as pd

def inspect_excel(file_path):
    xl = pd.ExcelFile(file_path)
    target_sheets = ['PointsSystem', 'Night&MorningRoutine', 'DayInputsTab']
    
    for sheet in target_sheets:
        if sheet in xl.sheet_names:
            print(f"\n{'='*20} {sheet} {'='*20}")
            df = pd.read_excel(file_path, sheet_name=sheet)
            # 顯示前 20 行，並過濾掉全空的列和行
            df_cleaned = df.dropna(how='all').dropna(axis=1, how='all')
            print(df_cleaned.head(20).to_string())
        else:
            print(f"\nSheet '{sheet}' not found.")

if __name__ == "__main__":
    inspect_excel('Edward DailyRecords.xlsx')
