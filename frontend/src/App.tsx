import React, { useState, useRef, useEffect } from 'react';
import {
  Stethoscope, Upload, RefreshCw, Download, 
  Activity, Layers, Flame
} from 'lucide-react';

// --- Complete Type System Setup ---
interface MissingColInfo { count: number; pct: number; rows: number[]; }
interface DuplicateRowInfo { row: number; firstAt: number; data: Record<string, any>; }
interface InvalidIssue { row: number; value: string; reason: string; }
interface InvalidColInfo { count: number; pct: number; issues: InvalidIssue[]; }
interface OutlierRow { row: number; value: number; }
interface OutlierColInfo { count: number; pct: number; lb: number; ub: number; q1: number; q3: number; rows: OutlierRow[]; }
interface ClassInfo { cls: string; count: number; pct: number; }
interface CorrelationPair { a: string; b: string; r: number; }
interface ConstantCol { col: string; val: string; }
interface MixedTypeInfo { type: string; count: number; pct: number; rows: number[]; }

interface AnalysisResult {
  file_id: string;
  n: number;
  cols: string[];
  missing: { total: number; pct: number; per: Record<string, MissingColInfo>; };
  duplicates: { count: number; pct: number; rows: DuplicateRowInfo[]; };
  invalid: { total: number; per: Record<string, InvalidColInfo>; };
  outliers: { total: number; per: Record<string, OutlierColInfo>; };
  imbalance: { col: string; classes: ClassInfo[]; ratio: number; };
  correlation: { pairs: CorrelationPair[]; matrix: Record<string, Record<string, number>>; cols: string[]; thresh: number; };
  constant: ConstantCol[];
  mixed: Record<string, MixedTypeInfo[]>;
  ml: { score: number; label: string; issues: string[]; };
}

interface FixOption { value: string; description: string; }
interface FixGroup { label: string; options: FixOption[]; }

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [fixMeta, setFixMeta] = useState<Record<string, FixGroup>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const API_URL = "http://127.0.0.1:8000";

  // Dynamic config extraction down the API wire
  useEffect(() => {
    fetch(`${API_URL}/api/fix-options`)
      .then(res => res.json())
      .then(data => setFixMeta(data))
      .catch(err => console.error("Could not link systemic fallback dictionaries:", err));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const uploadAndAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Analysis failed to resolve parameters.");
      setResult(data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const executeFix = async (issueType: string, column?: string, extraInfo?: Record<string, any>) => {
    if (!result) return;
    const groupKey = `${issueType}-${column || 'global'}`;
    const targetFix = selectedOptions[groupKey];

    if (!targetFix) {
      alert("Please select a valid remediation method variant from the selection list.");
      return;
    }

    setFixing(groupKey);
    try {
      const response = await fetch(`${API_URL}/api/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: result.file_id,
          issue_type: issueType,
          column: column,
          option: targetFix,
          extra_info: extraInfo
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Remote system rejected transformation request");
      setResult(data); 
    } catch (err: any) {
      alert(err.message);
    } finally {
      setFixing(null);
    }
  };

  // Modular Form Selection & Submission Component Generator
  // FIX: Shifted up before the return block statement so the compiler scope is intact
  function renderFixWidget(issueType: string, column?: string) {
    const groupKey = `${issueType}-${column || 'global'}`;
    const optionMetaGroup = fixMeta[issueType];
    
    // Safety check against undefined fields prior to backend api data resolution
    if (!optionMetaGroup || !optionMetaGroup.options) return null;

    return (
      <div className="flex items-center space-x-2 shrink-0">
        <select 
          className="bg-slate-900 text-slate-200 border border-slate-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
          value={selectedOptions[groupKey] || ""}
          onChange={(e) => setSelectedOptions({ ...selectedOptions, [groupKey]: e.target.value })}
        >
          <option value="">-- Choose Fix Action --</option>
          {optionMetaGroup.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.value}</option>
          ))}
        </select>
        <button 
          onClick={() => executeFix(issueType, column)}
          disabled={fixing === groupKey}
          className="bg-slate-700 text-white hover:bg-emerald-500 hover:text-slate-950 transition-all rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        >
          {fixing === groupKey ? "Patching..." : "Apply Fix"}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans antialiased">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Stethoscope className="w-8 h-8 text-emerald-400" />
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Data Doctor Studio
          </h1>
        </div>
        {result && (
          <button 
            onClick={() => window.open(`${API_URL}/api/download/${result.file_id}`, '_blank')} 
            className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-lg font-medium text-slate-950 transition-all shadow-lg"
          >
            <Download className="w-4 h-4" />
            <span>Export Diagnostic Output</span>
          </button>
        )}
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Upload Terminal Engine Card */}
        <section className="bg-slate-800/40 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
          <div 
            className="max-w-md mx-auto border-2 border-dashed border-slate-700 hover:border-slate-500 rounded-xl p-6 transition-colors group cursor-pointer" 
            onClick={() => fileInputRef.current?.click()}
          >
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".csv,.json,.xlsx,.xls" />
            <Upload className="w-12 h-12 text-slate-500 group-hover:text-emerald-400 mx-auto mb-2 transition-colors" />
            <span className="block font-medium text-slate-300">{file ? file.name : "Select evaluation source target..."}</span>
          </div>
          {file && (
            <button onClick={uploadAndAnalyze} disabled={loading} className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 rounded-xl font-semibold flex items-center space-x-2 mx-auto disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? "Analyzing Array Formats..." : "Run System Diagnostics"}</span>
            </button>
          )}
        </section>

        {result && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Dashboard Sidebar Metric Display Card */}
            <div className="bg-slate-800/70 border border-slate-800 rounded-xl p-6 space-y-4 h-fit shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Dataset Health Score</h3>
                <Activity className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-5xl font-extrabold text-white">{result.ml.score}</span>
                <span className="text-slate-500 text-sm">/100</span>
              </div>
              <div className="border-t border-slate-700/60 pt-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase">System Deductions Log</h4>
                {result.ml.issues.map((issue, idx) => (
                  <div key={idx} className="flex items-center space-x-2 text-xs text-slate-300 bg-slate-900/40 px-3 py-2 rounded border border-slate-800">
                    <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{issue}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Comprehensive Interactive Remediation Matrix Container Workspace */}
            <div className="lg:col-span-2 space-y-6">
              <h2 className="text-lg font-bold text-slate-200 tracking-tight flex items-center space-x-2">
                <Layers className="w-5 h-5 text-emerald-400" />
                <span>Feature Column Remediation Matrix Engine</span>
              </h2>

              {/* Remediator Unit: Missing Values Block */}
              {Object.keys(result.missing.per).map((col) => (
                <div key={col} className="bg-slate-800/50 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 bg-slate-900 text-slate-200 text-xs font-mono rounded border border-slate-700">{col}</span>
                      <span className="text-sm font-medium text-amber-400">Missing Values Found ({result.missing.per[col].count} rows)</span>
                    </div>
                  </div>
                  {renderFixWidget("missing", col)}
                </div>
              ))}

              {/* Remediator Unit: Outlier Bounds Block */}
              {Object.keys(result.outliers.per).map((col) => (
                <div key={col} className="bg-slate-800/50 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 bg-slate-900 text-slate-200 text-xs font-mono rounded border border-slate-700">{col}</span>
                      <span className="text-sm font-medium text-purple-400">Statistical Outliers Detected ({result.outliers.per[col].count} indexes)</span>
                    </div>
                  </div>
                  {renderFixWidget("outliers", col)}
                </div>
              ))}

              {/* Remediator Unit: String Formats Typo Validation Checklist Block */}
              {Object.keys(result.invalid.per).map((col) => (
                <div key={col} className="bg-slate-800/50 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 bg-slate-900 text-slate-200 text-xs font-mono rounded border border-slate-700">{col}</span>
                      <span className="text-sm font-medium text-rose-400">Invalid Format Anomalies ({result.invalid.per[col].count} items)</span>
                    </div>
                  </div>
                  {renderFixWidget("invalid", col)}
                </div>
              ))}

              {/* Remediator Unit: Mixed Primitive Structure Type Conversions */}
              {Object.keys(result.mixed).map((col) => (
                <div key={col} className="bg-slate-800/50 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 bg-slate-900 text-slate-200 text-xs font-mono rounded border border-slate-700">{col}</span>
                      <span className="text-sm font-medium text-indigo-400">Conflicting Feature Typings</span>
                    </div>
                  </div>
                  {renderFixWidget("mixed", col)}
                </div>
              ))}

              {/* Remediator Unit: Constant Columns (Zero Variance) */}
              {result.constant && result.constant.map((entry) => (
                <div key={entry.col} className="bg-slate-800/50 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 bg-slate-900 text-slate-200 text-xs font-mono rounded border border-slate-700">{entry.col}</span>
                      <span className="text-sm font-medium text-slate-400">{`Constant Column Found (All values are "${entry.val}")`}</span>
                    </div>
                  </div>
                  {renderFixWidget("constant", entry.col)}
                </div>
              ))}

              {/* Remediator Unit: Class Imbalance (Categorical Targets) */}
              {result.imbalance && result.imbalance.col && (
                <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 bg-slate-900 text-slate-200 text-xs font-mono rounded border border-slate-700">{result.imbalance.col}</span>
                      <span className="text-sm font-medium text-orange-400">{`Severe Class Imbalance Detected (Skew Ratio: ${result.imbalance.ratio.toFixed(2)})`}</span>
                    </div>
                  </div>
                  {renderFixWidget("imbalance", result.imbalance.col)}
                </div>
              ))}

              {/* Remediator Unit: High Multicollinearity/Correlation */}
              {result.correlation && result.correlation.pairs && result.correlation.pairs.map((pair, idx) => (
                <div key={idx} className="bg-slate-800/50 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 bg-slate-900 text-slate-200 text-xs font-mono rounded border border-slate-700">{pair.a}</span>
                      <span className="text-slate-400 text-xs">↔</span>
                      <span className="px-2 py-0.5 bg-slate-900 text-slate-200 text-xs font-mono rounded border border-slate-700">{pair.b}</span>
                      <span className="text-sm font-medium text-yellow-500">{`High Correlation (r = ${pair.r.toFixed(2)})`}</span>
                    </div>
                  </div>
                  {renderFixWidget("correlation", `${pair.a}__${pair.b}`)}
                </div>
              ))}

              {/* Global Record Deduplication Block Trigger Widget */}
              {result.duplicates.count > 0 && (
                <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <span className="text-sm font-medium text-red-400 font-bold">Redundant Multi-Row Matches ({result.duplicates.count} records)</span>
                  </div>
                  {renderFixWidget("duplicates")}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
