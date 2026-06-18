import json
import math
import re
import os
import uuid
import io
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import pandas as pd
import numpy as np

app = FastAPI(
    title="Data Doctor API",
    description="Backend API for running full dataset quality and ML readiness analysis",
    version="2.0.0"
)

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local development simplicity
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def is_missing(val: Any) -> bool:
    """Helper to detect missing/null values similarly to the JS implementation."""
    if val is None:
        return True
    if isinstance(val, (float, int)) and (np.isnan(val) or pd.isna(val)):
        return True
    s = str(val).strip().upper()
    return s in ("", "NULL", "NAN", "NONE", "NAT")

def is_numeric_str(val: Any) -> bool:
    """Check if value is numeric and not boolean/null."""
    if val is None or isinstance(val, bool):
        return False
    if isinstance(val, (int, float)):
        return not np.isnan(val)
    s = str(val).strip()
    if s in ("", "NULL", "NAN", "NONE"):
        return False
    try:
        float(s)
        return True
    except ValueError:
        return False

def check_date_invalid(val: Any) -> bool:
    """Check if date-like string is invalid."""
    if val is None or str(val).strip() == "":
        return False
    # Try parsing using pandas
    try:
        pd.to_datetime(val)
        return False
    except Exception:
        return True

TEMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp_storage")
os.makedirs(TEMP_DIR, exist_ok=True)

def run_analysis_on_df(
    df: pd.DataFrame,
    target_col: Optional[str] = None,
    corr_threshold: float = 0.8
) -> Dict[str, Any]:
    n_rows = len(df)
    cols = list(df.columns)
    
    if n_rows == 0:
        raise HTTPException(status_code=400, detail="The uploaded file contains no rows.")
    
    # 1. Missing Values Analysis
    missing_per = {}
    total_missing = 0
    
    for col in cols:
        missing_mask = df[col].apply(is_missing)
        m_count = int(missing_mask.sum())
        if m_count > 0:
            pct = round((m_count / n_rows) * 100, 2)
            # Get the first 50 row indices (0-indexed)
            m_rows = list(df.index[missing_mask])[:50]
            missing_per[col] = {
                "count": m_count,
                "pct": pct,
                "rows": [int(r) for r in m_rows]
            }
            total_missing += m_count
    
    missing_pct = round((total_missing / (n_rows * len(cols))) * 100, 2) if cols else 0.0
    
    # 2. Duplicate Rows Analysis
    seen = {}
    dup_rows = []
    for idx, row in df.iterrows():
        row_dict = row.to_dict()
        # Create a hashable representation (handling None/lists/dicts if any)
        row_key = tuple(sorted((k, str(v)) for k, v in row_dict.items()))
        if row_key in seen:
            dup_rows.append({
                "row": int(idx),
                "firstAt": int(seen[row_key]),
                "data": {k: (v if not pd.isna(v) else None) for k, v in row_dict.items()}
            })
        else:
            seen[row_key] = idx
            
    dup_count = len(dup_rows)
    dup_pct = round((dup_count / n_rows) * 100, 2)
    
    # 3. Invalid Values Analysis
    invalid_per = {}
    total_invalid = 0
    
    for col in cols:
        issues = []
        non_null_vals = df[col].dropna()
        
        # Numeric-like column check: if most non-nulls look numeric, but some don't.
        numeric_count = sum(non_null_vals.apply(is_numeric_str))
        string_count = len(non_null_vals) - numeric_count
        
        if numeric_count > string_count and string_count > 0:
            for idx, val in df[col].items():
                if val is not None and not is_numeric_str(val) and str(val).strip() != "":
                    issues.append({
                        "row": int(idx),
                        "value": str(val),
                        "reason": "Non-numeric in numeric-like column"
                    })
                    
        # Negative numbers check for price/age/etc.
        col_lc = col.lower()
        if any(k in col_lc for k in ['age', 'price', 'count', 'quantity', 'amount', 'salary', 'score', 'cost']):
            for idx, val in df[col].items():
                if is_numeric_str(val) and float(val) < 0:
                    issues.append({
                        "row": int(idx),
                        "value": str(val),
                        "reason": "Negative value in non-negative column"
                    })
                    
        # Invalid date check
        if any(k in col_lc for k in ['date', 'time']):
            for idx, val in df[col].items():
                if val is not None and check_date_invalid(val):
                    issues.append({
                        "row": int(idx),
                        "value": str(val),
                        "reason": "Invalid date format"
                    })
                    
        if issues:
            invalid_per[col] = {
                "count": len(issues),
                "pct": round((len(issues) / n_rows) * 100, 2),
                "issues": issues[:20]  # Limit sample size to 20
            }
            total_invalid += len(issues)
            
    # 4. Outliers (IQR Method)
    outliers_per = {}
    total_outliers = 0
    
    # Identify numeric columns where at least 50% of values are numeric
    num_cols = []
    for col in cols:
        non_null_vals = df[col].dropna()
        if len(non_null_vals) > 0:
            numeric_count = sum(non_null_vals.apply(is_numeric_str))
            if numeric_count > len(df) * 0.5:
                num_cols.append(col)
                
    for col in num_cols:
        # Gather valid numeric values with their index
        vals_with_idx = []
        for idx, val in df[col].items():
            if is_numeric_str(val):
                vals_with_idx.append((float(val), idx))
                
        if len(vals_with_idx) < 4:
            continue
            
        sorted_vals = sorted(v[0] for v in vals_with_idx)
        q1 = sorted_vals[int(len(sorted_vals) * 0.25)]
        q3 = sorted_vals[int(len(sorted_vals) * 0.75)]
        iqr = q3 - q1
        lb = q1 - 1.5 * iqr
        ub = q3 + 1.5 * iqr
        
        outliers = [v for v in vals_with_idx if v[0] < lb or v[0] > ub]
        if outliers:
            outliers_per[col] = {
                "count": len(outliers),
                "pct": round((len(outliers) / n_rows) * 100, 2),
                "lb": float(round(lb, 4)),
                "ub": float(round(ub, 4)),
                "q1": float(round(q1, 4)),
                "q3": float(round(q3, 4)),
                "rows": [{"row": int(o[1]), "value": float(round(o[0], 4))} for o in outliers[:30]]
            }
            total_outliers += len(outliers)
            
    # 5. Class Imbalance
    class_col = target_col
    if not class_col or class_col not in cols:
        # Auto-select: first column with unique categories between 2 and 20
        low_card = None
        for col in cols:
            non_nulls = df[col].dropna()
            if len(non_nulls) > 0:
                uniq_count = non_nulls.nunique()
                if 2 <= uniq_count <= 20:
                    low_card = col
                    break
        class_col = low_card if low_card else (cols[-1] if cols else "")
        
    class_arr = []
    ratio = 1.0
    if class_col and class_col in cols:
        non_null_class_series = df[class_col].dropna().astype(str)
        counts = non_null_class_series.value_counts().to_dict()
        total_class_non_null = len(non_null_class_series)
        
        if total_class_non_null > 0:
            class_arr = [
                {"cls": str(k), "count": int(v), "pct": round((v / total_class_non_null) * 100, 2)}
                for k, v in sorted(counts.items(), key=lambda x: x[1], reverse=True)
            ]
            if class_arr:
                maj_count = class_arr[0]["count"]
                min_count = class_arr[-1]["count"]
                ratio = round(min_count / maj_count, 4) if maj_count > 0 else 1.0
                
    # 6. Correlation Analysis
    corr_matrix = {}
    corr_pairs = []
    
    # Prepare numeric matrix
    if len(num_cols) >= 2:
        # Create a dataframe subset of numbers
        numeric_df = pd.DataFrame()
        for col in num_cols:
            numeric_df[col] = df[col].apply(lambda x: float(x) if is_numeric_str(x) else np.nan)
        
        # Compute pearson correlation
        pears_corr = numeric_df.corr(method="pearson").replace({np.nan: None})
        
        for c1 in num_cols:
            corr_matrix[c1] = {}
            for c2 in num_cols:
                val = pears_corr.loc[c1, c2]
                corr_matrix[c1][c2] = float(round(val, 4)) if val is not None else None
        
        # Find highly correlated pairs
        for i, c1 in enumerate(num_cols):
            for j, c2 in enumerate(num_cols):
                if j > i:
                    val = corr_matrix[c1][c2]
                    if val is not None and abs(val) >= corr_threshold:
                        corr_pairs.append({
                            "a": c1,
                            "b": c2,
                            "r": val
                        })
        corr_pairs.sort(key=lambda x: abs(x["r"]), reverse=True)
        
    # 7. Constant Columns Analysis
    const_cols = []
    for col in cols:
        # Consider column constant if it has only 1 unique non-null value (or is completely null)
        val_counts = df[col].value_counts(dropna=False)
        if len(val_counts) <= 1:
            val = val_counts.index[0] if len(val_counts) > 0 else None
            const_cols.append({
                "col": col,
                "val": str(val) if val is not None else "null"
            })
            
    # 8. Mixed Types Analysis
    mixed_cols = {}
    for col in cols:
        type_counts = {}
        for idx, val in df[col].items():
            if val is None or (isinstance(val, float) and np.isnan(val)):
                continue
            
            # Check type
            t_name = type(val).__name__
            # Map standard types for cleaner display
            if t_name in ('int', 'int64'):
                t_name = 'number'
            elif t_name in ('float', 'float64'):
                t_name = 'number'
            elif t_name == 'str':
                t_name = 'string'
            elif t_name == 'bool':
                t_name = 'boolean'
                
            if t_name not in type_counts:
                type_counts[t_name] = {"count": 0, "rows": []}
            type_counts[t_name]["count"] += 1
            if len(type_counts[t_name]["rows"]) < 5:
                type_counts[t_name]["rows"].append(int(idx))
        
        if len(type_counts) > 1:
            total_typed = sum(x["count"] for x in type_counts.values())
            mixed_cols[col] = [
                {
                    "type": t,
                    "count": info["count"],
                    "pct": round((info["count"] / total_typed) * 100, 1),
                    "rows": info["rows"]
                }
                for t, info in type_counts.items()
            ]
    # 9. ML Readiness Score Calculation
    score = 100.0
    deductions = []
    
    # Missing values deduction
    if missing_pct > 0:
        d = min(missing_pct * 2.0, 30.0)
        score -= d
        deductions.append(f"Missing values -{round(d, 1)} pts")
        
    # Duplicates deduction
    if dup_pct > 0:
        d = min(dup_pct * 1.5, 20.0)
        score -= d
        deductions.append(f"Duplicates -{round(d, 1)} pts")
        
    # Outliers deduction
    op = (total_outliers / n_rows) * 100 if n_rows > 0 else 0
    if op > 0:
        d = min(op, 15.0)
        score -= d
        deductions.append(f"Outliers -{round(d, 1)} pts")
        
    # Constant columns deduction
    if const_cols:
        d = min(len(const_cols) * 3.0, 15.0)
        score -= d
        deductions.append(f"Constant cols -{round(d, 1)} pts")
        
    # Mixed types deduction
    if mixed_cols:
        d = min(len(mixed_cols) * 2.0, 10.0)
        score -= d
        deductions.append(f"Mixed types -{round(d, 1)} pts")
        
    score = max(0.0, round(score, 1))
    
    if score >= 80:
        label = "Good"
    elif score >= 60:
        label = "Fair"
    elif score >= 40:
        label = "Poor"
    else:
        label = "Critical"
        
    # Build payload
    analysis_result = {
        "n": n_rows,
        "cols": cols,
        "missing": {
            "total": total_missing,
            "pct": missing_pct,
            "per": missing_per
        },
        "duplicates": {
            "count": dup_count,
            "pct": dup_pct,
            "rows": dup_rows[:15]
        },
        "invalid": {
            "total": total_invalid,
            "per": invalid_per
        },
        "outliers": {
            "total": total_outliers,
            "per": outliers_per
        },
        "imbalance": {
            "col": class_col,
            "classes": class_arr,
            "ratio": ratio
        },
        "correlation": {
            "pairs": corr_pairs,
            "matrix": corr_matrix,
            "cols": num_cols,
            "thresh": corr_threshold
        },
        "constant": const_cols,
        "mixed": mixed_cols,
        "ml": {
            "score": score,
            "label": label,
            "issues": deductions
        }
    }
    
    return analysis_result

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Data Doctor API is running"}

@app.post("/api/analyze")
async def analyze_dataset(
    file: UploadFile = File(...),
    target_col: Optional[str] = Form(None),
    corr_threshold: Optional[float] = Form(0.8)
):
    try:
        filename = file.filename.lower()
        # Parse file into DataFrame
        if filename.endswith(".csv"):
            df = pd.read_csv(file.file)
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(file.file)
        elif filename.endswith(".json"):
            # Load JSON content
            content = json.load(file.file)
            if isinstance(content, dict):
                # Try converting nested structure or list
                if "data" in content and isinstance(content["data"], list):
                    df = pd.DataFrame(content["data"])
                else:
                    df = pd.DataFrame([content])
            elif isinstance(content, list):
                df = pd.DataFrame(content)
            else:
                raise HTTPException(status_code=400, detail="Invalid JSON format. Expected list of records or dictionary.")
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload CSV, JSON, or Excel.")
        
        # Replace empty values / spaces / python NaNs with uniform pandas None or nan
        df = df.replace({np.nan: None})
        
        file_id = str(uuid.uuid4())
        meta = {
            "filename": file.filename,
            "target_col": target_col,
            "corr_threshold": corr_threshold
        }
        
        os.makedirs(TEMP_DIR, exist_ok=True)
        df.to_pickle(os.path.join(TEMP_DIR, f"{file_id}.pkl"))
        with open(os.path.join(TEMP_DIR, f"{file_id}_meta.json"), "w") as f:
            json.dump(meta, f)
            
        analysis_result = run_analysis_on_df(df, target_col, corr_threshold)
        analysis_result["file_id"] = file_id
        return analysis_result

    except HTTPException as he:
        raise he
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

class FixRequest(BaseModel):
    file_id: str
    issue_type: str
    column: Optional[str] = None
    option: str
    extra_info: Optional[Dict[str, Any]] = None

@app.post("/api/fix")
def fix_dataset(req: FixRequest):
    pkl_path = os.path.join(TEMP_DIR, f"{req.file_id}.pkl")
    meta_path = os.path.join(TEMP_DIR, f"{req.file_id}_meta.json")
    if not os.path.exists(pkl_path) or not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="Dataset or session not found.")
        
    with open(meta_path, "r") as f:
        meta = json.load(f)
        
    target_col = meta.get("target_col")
    corr_threshold = meta.get("corr_threshold", 0.8)
    
    df = pd.read_pickle(pkl_path)
    column = req.column
    option = req.option
    issue_type = req.issue_type
    
    # Apply requested correction
    if issue_type == "missing":
        if option == "Drop Rows":
            df = df[~df[column].apply(is_missing)]
        elif option in ("Fill with Mean", "Fill with Median"):
            # Check if column is numeric
            series = pd.to_numeric(df[column], errors='coerce')
            if series.notna().any():
                fill_val = float(series.mean()) if option == "Fill with Mean" else float(series.median())
                df[column] = df[column].apply(lambda x: fill_val if is_missing(x) else x)
            else:
                # categorical fallback - fill with mode
                non_null = df[column].dropna()
                non_null = non_null[non_null != ""]
                if not non_null.empty:
                    mode_val = non_null.mode()[0]
                    df[column] = df[column].apply(lambda x: mode_val if is_missing(x) else x)
        # Keep As Is: no action
        
    elif issue_type == "duplicates":
        if option == "Remove Exact Duplicates":
            df = df.drop_duplicates()
        # Keep Duplicates: no action
        
    elif issue_type == "invalid":
        if option in ("Replace with NULL", "Remove Rows"):
            col_lc = column.lower()
            non_null_vals = df[column].dropna()
            numeric_count = sum(non_null_vals.apply(is_numeric_str))
            string_count = len(non_null_vals) - numeric_count
            is_numeric_col = numeric_count > string_count and string_count > 0
            is_non_neg_col = any(k in col_lc for k in ['age', 'price', 'count', 'quantity', 'amount', 'salary', 'score', 'cost'])
            is_date_col = any(k in col_lc for k in ['date', 'time'])
            
            def is_cell_invalid(val):
                if val is None or str(val).strip() == "":
                    return False
                if is_numeric_col and not is_numeric_str(val):
                    return True
                if is_non_neg_col and is_numeric_str(val) and float(val) < 0:
                    return True
                if is_date_col and check_date_invalid(val):
                    return True
                return False
                
            if option == "Replace with NULL":
                df[column] = df[column].apply(lambda val: None if is_cell_invalid(val) else val)
            elif option == "Remove Rows":
                df = df[~df[column].apply(is_cell_invalid)]
        # Keep Values: no action
        
    elif issue_type == "outliers":
        if option in ("Remove Outliers", "Cap to IQR Bounds"):
            vals_with_idx = []
            for idx, val in df[column].items():
                if is_numeric_str(val):
                    vals_with_idx.append((float(val), idx))
            if len(vals_with_idx) >= 4:
                sorted_vals = sorted(v[0] for v in vals_with_idx)
                q1 = sorted_vals[int(len(sorted_vals) * 0.25)]
                q3 = sorted_vals[int(len(sorted_vals) * 0.75)]
                iqr = q3 - q1
                lb = q1 - 1.5 * iqr
                ub = q3 + 1.5 * iqr
                
                if option == "Remove Outliers":
                    def is_outlier(val):
                        if is_numeric_str(val):
                            f = float(val)
                            return f < lb or f > ub
                        return False
                    df = df[~df[column].apply(is_outlier)]
                elif option == "Cap to IQR Bounds":
                    def cap_val(val):
                        if is_numeric_str(val):
                            f = float(val)
                            if f < lb:
                                return lb
                            elif f > ub:
                                return ub
                        return val
                    df[column] = df[column].apply(cap_val)
        # Keep Values: no action
        
    elif issue_type == "imbalance":
        class_col = target_col
        if not class_col or class_col not in df.columns:
            low_card = None
            for col in df.columns:
                non_nulls = df[col].dropna()
                if len(non_nulls) > 0:
                    uniq_count = non_nulls.nunique()
                    if 2 <= uniq_count <= 20:
                        low_card = col
                        break
            class_col = low_card if low_card else (list(df.columns)[-1] if len(df.columns) > 0 else "")
            
        if class_col and class_col in df.columns:
            non_null_class_series = df[class_col].dropna().astype(str)
            counts = non_null_class_series.value_counts()
            if len(counts) >= 2:
                if option == "Oversample Minority Class":
                    maj_count = counts.iloc[0]
                    dfs = []
                    for cls, cnt in counts.items():
                        cls_df = df[df[class_col].astype(str) == str(cls)]
                        if cnt < maj_count:
                            oversampled = cls_df.sample(n=maj_count, replace=True, random_state=42)
                            dfs.append(oversampled)
                        else:
                            dfs.append(cls_df)
                    null_df = df[df[class_col].isna()]
                    if not null_df.empty:
                        dfs.append(null_df)
                    df = pd.concat(dfs, ignore_index=True)
                    
                elif option == "Undersample Majority Class":
                    min_count = counts.iloc[-1]
                    dfs = []
                    for cls, cnt in counts.items():
                        cls_df = df[df[class_col].astype(str) == str(cls)]
                        if cnt > min_count:
                            undersampled = cls_df.sample(n=min_count, replace=False, random_state=42)
                            dfs.append(undersampled)
                        else:
                            dfs.append(cls_df)
                    null_df = df[df[class_col].isna()]
                    if not null_df.empty:
                        dfs.append(null_df)
                    df = pd.concat(dfs, ignore_index=True)
        # Keep Distribution: no action
        
    elif issue_type == "correlation":
        if option == "Remove First Column":
            df = df.drop(columns=[column])
        elif option == "Remove Second Column" and req.extra_info and "column_b" in req.extra_info:
            df = df.drop(columns=[req.extra_info["column_b"]])
        # Keep Both: no action
        
    elif issue_type == "constant":
        if option == "Remove Column":
            df = df.drop(columns=[column])
        # Keep Column: no action
        
    elif issue_type == "mixed":
        if option == "Convert to Numeric":
            df[column] = pd.to_numeric(df[column], errors='coerce').replace({np.nan: None})
        elif option == "Convert Entire Column to String":
            df[column] = df[column].apply(lambda x: str(x) if x is not None else None)
        # Keep As Is: no action
        
    # Replace empty values / spaces / python NaNs with uniform pandas None or nan
    df = df.replace({np.nan: None})
    
    # Save updated dataframe
    df.to_pickle(pkl_path)
    
    # Run analysis again
    analysis_result = run_analysis_on_df(df, target_col, corr_threshold)
    analysis_result["file_id"] = req.file_id
    return analysis_result

@app.get("/api/download/{file_id}")
def download_dataset(file_id: str):
    pkl_path = os.path.join(TEMP_DIR, f"{file_id}.pkl")
    meta_path = os.path.join(TEMP_DIR, f"{file_id}_meta.json")
    if not os.path.exists(pkl_path) or not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="Session or file not found")
        
    with open(meta_path, "r") as f:
        meta = json.load(f)
    filename = meta.get("filename", "dataset.csv")
    df = pd.read_pickle(pkl_path)
    
    # Export based on original file extension
    fn_lower = filename.lower()
    if fn_lower.endswith(".csv"):
        buf = io.BytesIO()
        df.to_csv(buf, index=False)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=cleaned_{filename}"}
        )
    elif fn_lower.endswith((".xlsx", ".xls")):
        buf = io.BytesIO()
        df.to_excel(buf, index=False, engine='openpyxl')
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=cleaned_{filename}"}
        )
    elif fn_lower.endswith(".json"):
        buf = io.BytesIO()
        df.to_json(buf, orient="records", indent=2)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=cleaned_{filename}"}
        )
        @app.get("/api/fix-options")
        def get_fix_options():
            """Returns the available fix options for each issue type."""
            return {
                "missing": {
                    "label": "Missing Values",
                    "options": [
                        {"value": "Fill with Mean", "description": "Replace missing values with the column mean (numeric columns)"},
                        {"value": "Fill with Median", "description": "Replace missing values with the column median (numeric columns)"},
                        {"value": "Drop Rows", "description": "Remove all rows that have a missing value in this column"},
                        {"value": "Keep As Is", "description": "Do nothing, keep missing values as they are"}
                    ]
                },
                "duplicates": {
                    "label": "Duplicate Rows",
                    "options": [
                        {"value": "Remove Exact Duplicates", "description": "Delete all rows that are exact duplicates, keeping the first occurrence"},
                        {"value": "Keep Duplicates", "description": "Do nothing, keep duplicate rows as they are"}
                    ]
                },
                "invalid": {
                    "label": "Invalid Values",
                    "options": [
                        {"value": "Replace with NULL", "description": "Replace invalid values with NULL/None"},
                        {"value": "Remove Rows", "description": "Remove rows that contain invalid values in this column"},
                        {"value": "Keep Values", "description": "Do nothing, keep invalid values as they are"}
                    ]
                },
                "outliers": {
                    "label": "Outliers",
                    "options": [
                        {"value": "Remove Outliers", "description": "Delete rows where this column's value falls outside the IQR bounds"},
                        {"value": "Cap to IQR Bounds", "description": "Clamp outlier values to the lower/upper IQR bounds instead of removing them"},
                        {"value": "Keep Values", "description": "Do nothing, keep outliers as they are"}
                    ]
                },
                "imbalance": {
                    "label": "Class Imbalance",
                    "options": [
                        {"value": "Oversample Minority Class", "description": "Randomly duplicate minority class rows until all classes are balanced"},
                        {"value": "Undersample Majority Class", "description": "Randomly remove majority class rows until all classes are balanced"},
                        {"value": "Keep Distribution", "description": "Do nothing, keep the class distribution as it is"}
                    ]
                },
                "correlation": {
                    "label": "High Correlation",
                    "options": [
                        {"value": "Remove First Column", "description": "Drop the first column of the correlated pair"},
                        {"value": "Remove Second Column", "description": "Drop the second column of the correlated pair"},
                        {"value": "Keep Both", "description": "Do nothing, keep both correlated columns"}
                    ]
                },
                "constant": {
                    "label": "Constant Columns",
                    "options": [
                        {"value": "Remove Column", "description": "Drop this column since it has no variance and provides no information"},
                        {"value": "Keep Column", "description": "Do nothing, keep the constant column"}
                    ]
                },
                "mixed": {
                    "label": "Mixed Types",
                    "options": [
                        {"value": "Convert to Numeric", "description": "Force-convert the column to numeric; non-numeric values become NULL"},
                        {"value": "Convert Entire Column to String", "description": "Convert all values in the column to string type"},
                        {"value": "Keep As Is", "description": "Do nothing, keep mixed types as they are"}
                    ]
                }
            }
    else:
        # Fallback to CSV
        buf = io.BytesIO()
        df.to_csv(buf, index=False)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=cleaned_dataset.csv"}
        )
