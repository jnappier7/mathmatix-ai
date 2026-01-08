import csv
import re
from datetime import datetime, timedelta

# --- Configuration ---
INPUT_FILE = 'item-bank.csv'
OUTPUT_FILE = 'item-bank-fixed.csv'
BASE_DATE = datetime(1899, 12, 31)  # Excel base date adjustment

def serial_to_fraction(match):
    """Converts Excel serials (e.g., 45724) back to fractions (e.g., 1/3)"""
    try:
        serial = int(match.group(1))
        # Filter for the specific range of corruption (Year 2025 serials)
        if 45600 <= serial <= 46050:
            d = BASE_DATE + timedelta(days=serial)
            return f"{d.month}/{d.day}"
    except:
        pass
    return match.group(0)

def clean_text_column(text):
    """Finds and replaces corrupted serial numbers in text"""
    if text is None: return ""
    # Regex to find 5-digit numbers starting with 45 (common 2025 date serials)
    return re.sub(r'\b(45[6-9]\d{2})\b', serial_to_fraction, str(text))

def clean_grade(g):
    """Ensures Grade is a clean string"""
    if g is None: return "HS"
    s = str(g).strip()
    if s == '' or s.lower() == 'nan': return "HS"
    
    # Fix serials in Grade (e.g., 45973 -> Nov 12 -> Grade 11)
    if re.match(r'^\d{5}$', s):
        try:
            serial = int(s)
            if 45600 <= serial <= 46050:
                d = BASE_DATE + timedelta(days=serial)
                return str(d.month)
        except: pass
            
    # Fix "12-Nov" format
    if re.match(r'\d{1,2}-[A-Za-z]{3}', s):
        if "Nov" in s: return "11"
        if "Oct" in s: return "10"
        if "Sep" in s: return "9"
        if "Dec" in s: return "12"
        
    if s in ['K', 'PK']: return "K"
    if s.endswith('.0'): return s[:-2]
    
    return s

def calc_difficulty(grade, skill, text):
    """Calculates Item Difficulty based on Grade, Skill, and Text Complexity"""
    # 1. Base Theta by Grade
    base_map = {
        "K": -2.5, "PK": -2.5, "1": -2.0, "2": -1.5, "3": -1.0, 
        "4": -0.5, "5": 0.0, "6": 0.5, "7": 1.0, "8": 1.5, 
        "9": 2.0, "10": 2.5, "11": 2.5, "12": 2.5, 
        "HS": 2.5, "HS-Alg1": 2.0, "HS-Alg2": 2.5, 
        "calc-1": 2.8, "PreCalc": 2.6, "13+": 2.8
    }
    base = base_map.get(grade, 2.5) # Default to HS difficulty
    
    # 2. Skill Domain Adjustment
    adj = 0.0
    skill = str(skill)
    if ".NS." in skill: adj += 0.2
    if ".EE." in skill: adj += 0.3
    if ".G." in skill: adj += 0.2
    if ".RP." in skill: adj += 0.3
    
    # 3. Text Complexity Modifier
    if len(text) > 100: adj += 0.2
    if "?" in text and "Calculate" not in text: adj += 0.2
    
    val = base + adj
    # Clamp between -3.0 and 3.0
    return round(max(-3.0, min(3.0, val)), 1)

def process_file():
    print(f"Reading from {INPUT_FILE}...")
    
    rows_out = []
    seen_ids = set()
    
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            
            for row in reader:
                # 1. Clean IDs and Deduplicate
                row_id = row.get('ID', '').strip()
                if not row_id or row_id in seen_ids:
                    continue
                seen_ids.add(row_id)
                
                # Try to keep numeric IDs as integers for cleaner CSV (unquoted)
                try:
                    row['ID'] = int(row_id)
                except:
                    pass # Keep as string if alphanumeric
                
                # 2. Clean Text Columns
                for col in ['Question_Text', 'Option_A', 'Option_B', 'Option_C', 'Option_D']:
                    row[col] = clean_text_column(row.get(col, ''))
                
                # 3. Clean Grade
                raw_grade = row.get('Grade_Level', '')
                skill = row.get('Skill_Standard', '')
                
                # Fallback logic for missing grade
                if not raw_grade or raw_grade.lower() == 'nan':
                    if 'Calc' in skill:
                        cleaned_grade = 'calc-1'
                    else:
                        cleaned_grade = 'HS'
                else:
                    cleaned_grade = clean_grade(raw_grade)
                
                row['Grade_Level'] = cleaned_grade
                
                # 4. Calc Difficulty
                diff = calc_difficulty(cleaned_grade, skill, row['Question_Text'])
                row['Difficulty'] = diff
                row['Discrimination'] = 1.0
                
                rows_out.append(row)
                
    except FileNotFoundError:
        print(f"Error: Could not find '{INPUT_FILE}'. Make sure it is in the same folder.")
        return

    # 5. Write Output
    # We use QUOTE_NONNUMERIC to ensure strings (like "7") get quoted.
    # Note: This will also quote other strings like "Option A". This is standard valid CSV.
    fieldnames = ['ID', 'Question_Text', 'Option_A', 'Option_B', 'Option_C', 'Option_D', 
                  'Correct_Answer', 'Skill_Standard', 'Grade_Level', 'Difficulty', 'Discrimination']
    
    with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_NONNUMERIC)
        writer.writeheader()
        writer.writerows(rows_out)
        
    print(f"Success! Processed {len(rows_out)} items.")
    print(f"Saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    process_file()
