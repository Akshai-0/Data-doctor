import React, { useState, useRef } from 'react';
import {
  Stethoscope,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Info,
  FileText,
  FileCheck2,
  ListFilter,
  Activity,
  Layers,
  Link,
  Flame
} from 'lucide-react';

interface MissingColInfo {
  count: number;
  pct: number;
  rows: number[];
}

interface DuplicateRowInfo {
  row: number;
  firstAt: number;
  data: Record<string, any>;
}

interface InvalidIssue {
  row: number;
  value: string;
  reason: string;
}

interface InvalidColInfo {
  count: number;
  pct: number;
  issues: InvalidIssue[];
}

interface OutlierRow {
  row: number;
  value: number;
}

interface OutlierColInfo {
  count: number;
  pct: number;
  lb: number;
  ub: number;
  q1: number;
  q3: number;
  rows: OutlierRow[];
}

interface ClassInfo {
  cls: string;
  count: number;
  pct: number;
}

interface CorrelationPair {
  a: string;
  b: string;
  r: number;
}

interface ConstantCol {
  col: string;
  val: string;
}

interface MixedTypeInfo {
  type: string;
  count: number;
  pct: number;
  rows: number[];
}

interface AnalysisResult {
  file_id: string;
  n: number;
  cols: string[];
  missing: {
    total: number;
    pct: number;
    per: Record<string, MissingColInfo>;
  };
  duplicates: {
    count: number;
    pct: number;
    rows: DuplicateRowInfo[];
  };
  invalid: {
    total: number;
    per: Record<string, InvalidColInfo>;
  };
  outliers: {
    total: number;
    per: Record<string, OutlierColInfo>;
  };
  imbalance: {
    col: string;
    classes: ClassInfo[];
    ratio: number;
  };
  correlation: {
    pairs: CorrelationPair[];
    matrix: Record<string, Record<string, number | null>>;
    cols: string[];
    thresh: number;
  };
  constant: ConstantCol[];
  mixed: Record<string, MixedTypeInfo[]>;
  ml: {
    score: number;
    label: string;
    issues: string[];
  };
}

function FixBox({
  issueType, column, options, fixSelections, setFixSelections, applyFix, fixLoading, extraInfo
}: {
  issueType: string;
  column?: string;
  options: { value: string; description: string }[];
  fixSelections: Record<string, string>;
  setFixSelections: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  applyFix: (issueType: string, column?: string, extraInfo?: Record<string, any>) => void;
  fixLoading: boolean;
  extraInfo?: Record<string, any>;
}) {
  const key = `${issueType}__${column || ''}`;
  const selected = fixSelections[key] || '';

  return (
    <div style={{
      marginTop: '1.5rem',
      background: 'linear-gradient(135deg, hsla(160, 80%, 10%, 0.6), hsla(210, 80%, 10%, 0.6))',
      border: '1px solid hsla(160, 70%, 35%, 0.35)',
      borderRadius: '12px',
      padding: '1.25rem 1.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: 'linear-gradient(135deg, hsl(160, 80%, 45%), hsl(210, 100%, 55%))',
          boxShadow: '0 0 6px hsl(160, 80%, 45%)'
        }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(160, 70%, 60%)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Suggested Fix{column ? ` — ${column}` : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1.1rem' }}>
        {options.map(opt => (
          <label key={opt.value} style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer',
            padding: '10px 12px', borderRadius: '8px', transition: 'background 0.15s',
            background: selected === opt.value ? 'hsla(160, 70%, 35%, 0.2)' : 'transparent',
            border: selected === opt.value ? '1px solid hsla(160, 70%, 45%, 0.4)' : '1px solid transparent',
          }}>
            <input
              type="radio"
              name={key}
              value={opt.value}
              checked={selected === opt.value}
              onChange={() => setFixSelections(prev => ({ ...prev, [key]: opt.value }))}
              style={{ marginTop: '2px', accentColor: 'hsl(160, 70%, 45%)' }}
            />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>{opt.value}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{opt.description}</div>
            </div>
          </label>
        ))}
      </div>

      <button
        onClick={() => applyFix(issueType, column, extraInfo)}
        disabled={!selected || fixLoading}
        style={{
          padding: '8px 20px', borderRadius: '8px', border: 'none',
          cursor: selected && !fixLoading ? 'pointer' : 'not-allowed',
          background: selected && !fixLoading
            ? 'linear-gradient(135deg, hsl(160, 70%, 38%), hsl(210, 90%, 48%))'
            : 'hsla(210, 20%, 25%, 0.5)',
          color: selected && !fixLoading ? 'white' : 'var(--text-muted)',
          fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
          transition: 'all 0.2s',
          boxShadow: selected && !fixLoading ? '0 4px 12px hsla(160, 70%, 35%, 0.3)' : 'none',
        }}
      >
        {fixLoading ? (
          <><div className="loading-spinner" style={{ width: '14px', height: '14px' }} /> Applying fix...</>
        ) : (
          <><CheckCircle2 size={14} /> Apply Fix</>
        )}
      </button>
    </div>
  );
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [targetCol, setTargetCol] = useState('');
  const [corrThresh, setCorrThresh] = useState('0.8');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState('missing');
  const [dragActive, setDragActive] = useState(false);
  const [fileId, setFileId] = useState<string | null>(null);
  const [fixLoading, setFixLoading] = useState(false);
  const [fixSelections, setFixSelections] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) validateAndSetFile(e.dataTransfer.files[0]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) validateAndSetFile(e.target.files[0]);
  };

  const validateAndSetFile = (f: File) => {
    const name = f.name.toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.json') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
      setFile(f);
      setError(null);
    } else {
      setError('Unsupported file type. Please upload a CSV, JSON, or Excel file.');
      setFile(null);
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  const resetApp = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setTargetCol('');
    setCorrThresh('0.8');
    setFileId(null);
    setFixSelections({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const runAnalysis = async () => {
    if (!file) return;
    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    if (targetCol.trim()) formData.append('target_col', targetCol.trim());
    formData.append('corr_threshold', corrThresh);

    try {
      const baseUrl = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000';
      const response = await fetch(`${baseUrl}/api/analyze`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errDetail = await response.json().catch(() => ({ detail: 'Unknown server error' }));
        throw new Error(errDetail.detail || 'Failed to analyze the dataset.');
      }
      const data: AnalysisResult = await response.json();
      setResult(data);
      setFileId(data.file_id);
      if (data.missing.total > 0) setActiveTab('missing');
      else if (data.duplicates.count > 0) setActiveTab('duplicates');
      else if (data.invalid.total > 0) setActiveTab('invalid');
      else if (data.outliers.total > 0) setActiveTab('outliers');
      else setActiveTab('imbalance');
    } catch (err: any) {
      setError(err.message || 'Error communicating with analysis backend.');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFix = async (issueType: string, column?: string, extraInfo?: Record<string, any>) => {
    if (!fileId) return;
    const option = fixSelections[`${issueType}__${column || ''}`];
    if (!option) return;
    setFixLoading(true);
    setError(null);
    try {
      // FIX FIXED HERE: Changed endpoint path from /api/analyze to /api/fix
      const response = await fetch('https://data-doctor-production-4bda.up.railway.app/api/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fileId, issue_type: issueType, column, option, extra_info: extraInfo }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Unknown data execution failure.' }));
        throw new Error(err.detail);
      }
      const data: AnalysisResult = await response.json();
      setResult(data);
      setFileId(data.file_id);
    } catch (err: any) {
      setError(err.message || 'Fix execution configuration failed.');
    } finally {
      setFixLoading(false);
    }
  };

  const getScoreColorHex = (score: number) => {
    if (score >= 80) return 'hsl(142, 72%, 40%)';
    if (score >= 60) return 'hsl(38, 92%, 50%)';
    return 'hsl(354, 76%, 50%)';
  };

  const getBadgeClass = (count: number) => {
    if (count === 0) return 'badge-success';
    if (count < 5) return 'badge-warning';
    return 'badge-danger';
  };

  return (
    <div className="container">
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2.5rem' }}>
        <div style={{
          background: 'var(--grad-primary)',
          padding: '10px',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 15px hsla(220, 100%, 55%, 0.2)'
        }}>
          <Stethoscope size={28} color="white" />
        </div>
        <div>
          <h1>Data Doctor</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Full dataset quality analysis &amp; ML readiness reporting
          </p>
        </div>
      </header>

      {/* Upload Screen */}
      {!result && (
        <div className="card">
          <div
            className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={triggerFileInput}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".csv,.xlsx,.xls,.json"
              onChange={handleFileChange}
            />
            <div className="upload-icon">
              <Upload size={48} />
            </div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '4px', fontWeight: 600 }}>Drop your dataset here</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Supports CSV, Excel (.xlsx, .xls), or JSON files
            </p>
            {file && (
              <div className="file-name-pill" onClick={(e) => e.stopPropagation()}>
                <FileText size={16} />
                <span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            )}
          </div>

          <div className="options-grid">
            <div className="form-group">
              <label htmlFor="target-col-input">Target Column (Optional)</label>
              <input
                id="target-col-input"
                type="text"
                placeholder="e.g. class, target, label"
                value={targetCol}
                onChange={(e) => setTargetCol(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="form-group">
              <label htmlFor="corr-thresh-input">Correlation Threshold</label>
              <input
                id="corr-thresh-input"
                type="number"
                step="0.05"
                min="0.1"
                max="1.0"
                value={corrThresh}
                onChange={(e) => setCorrThresh(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={runAnalysis}
            disabled={!file || isLoading}
            style={{ minHeight: '48px' }}
          >
            {isLoading ? (
              <>
                <div className="loading-spinner"></div>
                <span className="pulse">Analyzing dataset...</span>
              </>
            ) : (
              <>
                <Activity size={18} />
                <span>Analyze Dataset</span>
              </>
            )}
          </button>

          {error && (
            <div style={{
              background: 'var(--bg-danger)',
              border: '1px solid hsla(354, 76%, 50%, 0.2)',
              borderRadius: '8px',
              padding: '12px 16px',
              color: 'hsl(354, 95%, 80%)',
              fontSize: '0.9rem',
              marginTop: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Results View */}
      {result && (
        <div>
          {/* Top Info Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              <FileCheck2 size={16} />
              <span>
                <strong>{result.n}</strong> rows &times; <strong>{result.cols.length}</strong> columns &mdash; {file?.name}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={resetApp} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                <RefreshCw size={14} />
                <span>Upload New File</span>
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => window.open(`https://data-doctor-production-4bda.up.railway.app/api/download/${fileId}`, '_blank')}
                disabled={!fileId}
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              >
                <FileText size={14} />
                <span>Download Cleaned Dataset</span>
              </button>
            </div>
          </div>

          {/* ML Score Card */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="score-flex">
              <div className="score-value-box">
                <span className="score-number" style={{ color: getScoreColorHex(result.ml.score) }}>
                  {result.ml.score}
                </span>
                <span className="score-desc">ML Readiness Score</span>
              </div>
              <div className="score-track-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span className="score-label-pill" style={{ color: getScoreColorHex(result.ml.score), margin: 0 }}>
                    {result.ml.label} Quality
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {result.ml.score} / 100
                  </span>
                </div>
                <div className="track-bg">
                  <div
                    className="track-fill"
                    style={{ width: `${result.ml.score}%`, background: getScoreColorHex(result.ml.score) }}
                  ></div>
                </div>
                {result.ml.issues.length > 0 ? (
                  <div className="deductions-list">
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', marginRight: '4px' }}>Deductions:</span>
                    {result.ml.issues.map((issue, i) => (
                      <span key={i} className="deduction-pill">{issue}</span>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--color-success)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                    <CheckCircle2 size={12} />
                    <span>Flawless dataset quality! No ML readiness deductions.</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Metrics Overview Grid */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-val">{result.missing.total}</div>
              <div className="metric-label">Missing Values</div>
            </div>
            <div className="metric-card">
              <div className="metric-val">{result.duplicates.count}</div>
              <div className="metric-label">Duplicate Rows</div>
            </div>
            <div className="metric-card">
              <div className="metric-val">{result.invalid.total}</div>
              <div className="metric-label">Invalid Cells</div>
            </div>
            <div className="metric-card">
              <div className="metric-val">{result.outliers.total}</div>
              <div className="metric-label">Outlier Cells</div>
            </div>
            <div className="metric-card">
              <div className="metric-val">{result.constant.length}</div>
              <div className="metric-label">Constant Cols</div>
            </div>
            <div className="metric-card">
              <div className="metric-val">{Object.keys(result.mixed).length}</div>
              <div className="metric-label">Mixed Type Cols</div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="tabs-container">
            <button className={`tab-btn ${activeTab === 'missing' ? 'active' : ''}`} onClick={() => setActiveTab('missing')}>
              Missing Values ({result.missing.total})
            </button>
            <button className={`tab-btn ${activeTab === 'duplicates' ? 'active' : ''}`} onClick={() => setActiveTab('duplicates')}>
              Duplicates ({result.duplicates.count})
            </button>
            <button className={`tab-btn ${activeTab === 'invalid' ? 'active' : ''}`} onClick={() => setActiveTab('invalid')}>
              Invalid Values ({result.invalid.total})
            </button>
            <button className={`tab-btn ${activeTab === 'outliers' ? 'active' : ''}`} onClick={() => setActiveTab('outliers')}>
              Outliers ({result.outliers.total})
            </button>
            <button className={`tab-btn ${activeTab === 'imbalance' ? 'active' : ''}`} onClick={() => setActiveTab('imbalance')}>
              Class Imbalance
            </button>
            <button className={`tab-btn ${activeTab === 'correlation' ? 'active' : ''}`} onClick={() => setActiveTab('correlation')}>
              Correlation ({result.correlation.pairs.length})
            </button>
            <button className={`tab-btn ${activeTab === 'constant' ? 'active' : ''}`} onClick={() => setActiveTab('constant')}>
              Constant Cols ({result.constant.length})
            </button>
            <button className={`tab-btn ${activeTab === 'mixed' ? 'active' : ''}`} onClick={() => setActiveTab('mixed')}>
              Mixed Types ({Object.keys(result.mixed).length})
            </button>
          </div>

          {/* Tab Panels */}
          <div className="card" style={{ padding: '1.75rem 2rem' }}>

            {/* ── Missing Tab ── */}
            {activeTab === 'missing' && (
              <div>
                <div className="section-header">
                  <div className="section-title"><ListFilter size={18} /><span>Missing Values Report</span></div>
                  <div className="section-info">{result.missing.total} total missing cells ({result.missing.pct}% of all data)</div>
                </div>
                {result.missing.total === 0 ? (
                  <div className="ok-icon-container">
                    <CheckCircle2 size={18} /><span>Perfect! No missing values detected in the entire dataset.</span>
                  </div>
                ) : (
                  <div>
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>Column Name</th><th>Missing Count</th><th>Percentage</th><th>Affected Row Indexes (Samples)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(result.missing.per).map(([col, info]) => (
                            <tr key={col}>
                              <td><strong>{col}</strong></td>
                              <td>{info.count}</td>
                              <td><span className={`badge ${getBadgeClass(info.count)}`}>{info.pct}%</span></td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {info.rows.slice(0, 10).join(', ')}{info.rows.length > 10 ? ' ...' : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ marginTop: '2rem' }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Missing Percentages by Column
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {Object.entries(result.missing.per).map(([col, info]) => (
                          <div key={col} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: '150px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '0.85rem', fontWeight: 500 }}>{col}</div>
                            <div style={{ flex: 1 }}>
                              <div className="bar-track">
                                <div className="bar-fill" style={{ width: `${info.pct}%`, background: 'var(--grad-primary)' }}></div>
                                <div className="bar-label-overlay">{info.pct}%</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {Object.keys(result.missing.per).map(col => (
                      <FixBox
                        key={col}
                        issueType="missing"
                        column={col}
                        options={[
                          { value: 'Fill with Mean', description: 'Replace missing values with the column mean (numeric columns)' },
                          { value: 'Fill with Median', description: 'Replace missing values with the column median (numeric columns)' },
                          { value: 'Drop Rows', description: 'Remove all rows that have a missing value in this column' },
                          { value: 'Keep As Is', description: 'Do nothing, keep missing values as they are' },
                        ]}
                        fixSelections={fixSelections}
                        setFixSelections={setFixSelections}
                        applyFix={applyFix}
                        fixLoading={fixLoading}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Duplicates Tab ── */}
            {activeTab === 'duplicates' && (
              <div>
                <div className="section-header">
                  <div className="section-title"><Layers size={18} /><span>Duplicate Rows Report</span></div>
                  <div className="section-info">{result.duplicates.count} duplicated rows found ({result.duplicates.pct}%)</div>
                </div>
                {result.duplicates.count === 0 ? (
                  <div className="ok-icon-container">
                    <CheckCircle2 size={18} /><span>Excellent! All rows in this dataset are unique.</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap' }}>
                      <div style={{ width: '120px', height: '120px' }}>
                        <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%' }}>
                          <circle cx="18" cy="18" r="15.915" fill="none" stroke="hsla(223, 23%, 10%, 0.8)" strokeWidth="3" />
                          <circle cx="18" cy="18" r="15.915" fill="none" stroke="hsl(210, 100%, 55%)" strokeWidth="3.2"
                            strokeDasharray={`${100 - result.duplicates.pct} ${result.duplicates.pct}`} strokeDashoffset="25" />
                          <circle cx="18" cy="18" r="15.915" fill="none" stroke="hsl(354, 76%, 50%)" strokeWidth="3.2"
                            strokeDasharray={`${result.duplicates.pct} ${100 - result.duplicates.pct}`}
                            strokeDashoffset={`${125 - result.duplicates.pct}`} />
                        </svg>
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'hsl(210, 100%, 55%)', borderRadius: '3px' }}></span>
                          <span style={{ fontSize: '0.85rem' }}>Unique Rows: <strong>{result.n - result.duplicates.count}</strong> ({(100 - result.duplicates.pct).toFixed(2)}%)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'hsl(354, 76%, 50%)', borderRadius: '3px' }}></span>
                          <span style={{ fontSize: '0.85rem' }}>Duplicate Rows: <strong>{result.duplicates.count}</strong> ({result.duplicates.pct}%)</span>
                        </div>
                      </div>
                    </div>
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>Row Number</th><th>First Appeared At</th>
                            {result.cols.slice(0, 5).map(c => <th key={c}>{c}</th>)}
                            {result.cols.length > 5 && <th>...</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {result.duplicates.rows.map((row, i) => (
                            <tr key={i}>
                              <td><strong>{row.row}</strong></td>
                              <td>Row {row.firstAt}</td>
                              {result.cols.slice(0, 5).map(c => (
                                <td key={c}>{row.data[c] !== null ? String(row.data[c]) : <span style={{ color: 'var(--text-muted)' }}>null</span>}</td>
                              ))}
                              {result.cols.length > 5 && <td style={{ color: 'var(--text-muted)' }}>...</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <FixBox
                      issueType="duplicates"
                      options={[
                        { value: 'Remove Exact Duplicates', description: 'Delete all duplicate rows, keeping the first occurrence of each' },
                        { value: 'Keep Duplicates', description: 'Do nothing, keep duplicate rows as they are' },
                      ]}
                      fixSelections={fixSelections}
                      setFixSelections={setFixSelections}
                      applyFix={applyFix}
                      fixLoading={fixLoading}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Invalid Values Tab ── */}
            {activeTab === 'invalid' && (
              <div>
                <div className="section-header">
                  <div className="section-title"><ShieldAlert size={18} /><span>Invalid Values Report</span></div>
                  <div className="section-info">{result.invalid.total} total cell invalidations detected</div>
                </div>
                {result.invalid.total === 0 ? (
                  <div className="ok-icon-container">
                    <CheckCircle2 size={18} /><span>Superb! No type mismatches, negative constraints, or parsing conflicts found.</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {Object.entries(result.invalid.per).map(([col, info]) => (
                      <div key={col}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 600 }}>{col}</span>
                          <span className={`badge ${getBadgeClass(info.count)}`}>{info.count} issues ({info.pct}%)</span>
                        </div>
                        <div className="table-container">
                          <table>
                            <thead>
                              <tr>
                                <th style={{ width: '120px' }}>Row Index</th>
                                <th style={{ width: '200px' }}>Value Found</th>
                                <th>Reason / Invalidation Rule</th>
                              </tr>
                            </thead>
                            <tbody>
                              {info.issues.slice(0, 10).map((issue, idx) => (
                                <tr key={idx}>
                                  <td><strong>{issue.row}</strong></td>
                                  <td><code style={{ color: 'hsl(354, 90%, 70%)' }}>{issue.value}</code></td>
                                  <td>{issue.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <FixBox
                          issueType="invalid"
                          column={col}
                          options={[
                            { value: 'Coerce to Valid or Null', description: 'Convert structural invalidations directly into usable numeric types or fallback to NaN' },
                            { value: 'Drop Faulty Rows', description: 'Erase row vectors housing formatting conflicts from processing pipelines entirely' },
                          ]}
                          fixSelections={fixSelections}
                          setFixSelections={setFixSelections}
                          applyFix={applyFix}
                          fixLoading={fixLoading}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Outliers Tab ── */}
            {activeTab === 'outliers' && (
              <div>
                <div className="section-header">
                  <div className="section-title"><Flame size={18} /><span>Outliers Analysis (IQR Rule)</span></div>
                  <div className="section-info">{result.outliers.total} statistical anomalies flagged</div>
                </div>
                {result.outliers.total === 0 ? (
                  <div className="ok-icon-container">
                    <CheckCircle2 size={18} /><span>Clean metrics! No extreme values detected across distributions.</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                    {Object.entries(result.outliers.per).map(([col, info]) => (
                      <div key={col}>
                        <div style={{ display: 'flex', justifyItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 600 }}>{col}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Bounds: [{info.lb.toFixed(2)}, {info.ub.toFixed(2)}] | Q1: {info.q1.toFixed(2)} | Q3: {info.q3.toFixed(2)}
                          </span>
                        </div>
                        <div className="table-container">
                          <table>
                            <thead>
                              <tr><th>Row Index</th><th>Extreme Value Recorded</th></tr>
                            </thead>
                            <tbody>
                              {info.rows.slice(0, 8).map((r, i) => (
                                <tr key={i}>
                                  <td><strong>{r.row}</strong></td>
                                  <td><span style={{ color: 'hsl(38, 95%, 60%)', fontWeight: 600 }}>{r.value}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <FixBox
                          issueType="outliers"
                          column={col}
                          options={[
                            { value: 'Cap at IQR Boundaries', description: 'Clip values outside boundaries to historical statistical thresholds' },
                            { value: 'Drop Rows', description: 'Erase outliers entirely to shield training pipelines from structural scale skewing' },
                          ]}
                          fixSelections={fixSelections}
                          setFixSelections={setFixSelections}
                          applyFix={applyFix}
                          fixLoading={fixLoading}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Class Imbalance Tab ── */}
            {activeTab === 'imbalance' && (
              <div>
                <div className="section-header">
                  <div className="section-title"><Activity size={18} /><span>Target Class Imbalance</span></div>
                  <div className="section-info">Analyzed Tracking Parameter: <strong>{result.imbalance.col || 'None Specified'}</strong></div>
                </div>
                {!result.imbalance.col ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>
                    <Info size={24} style={{ marginBottom: '8px', display: 'block', margin: '0 auto' }} />
                    Provide an explicit target variable during initialization to execute automated balancing analysis audits.
                  </div>
                ) : (
                  <div>
                    <div style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                      Minority-to-Majority Ratio structural calculation: <strong style={{ color: result.imbalance.ratio < 0.2 ? 'hsl(354, 76%, 50%)' : 'hsl(142, 72%, 40%)' }}>{result.imbalance.ratio.toFixed(4)}</strong>
                    </div>
                    <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                      <table>
                        <thead>
                          <tr><th>Class Value Label</th><th>Frequency Distribution</th><th>Vector Space Weight</th></tr>
                        </thead>
                        <tbody>
                          {result.imbalance.classes.map((cls, idx) => (
                            <tr key={idx}>
                              <td><code>{cls.cls}</code></td>
                              <td>{cls.count}</td>
                              <td>{cls.pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <FixBox
                      issueType="imbalance"
                      options={[
                        { value: 'Resample Weights', description: 'Inject downstream weighting factors to equalize tracking gradients cleanly' },
                        { value: 'Keep As Is', description: 'Maintain current class distributions without adjusting balancing matrices' }
                      ]}
                      fixSelections={fixSelections}
                      setFixSelections={setFixSelections}
                      applyFix={applyFix}
                      fixLoading={fixLoading}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Correlation Tab ── */}
            {activeTab === 'correlation' && (
              <div>
                <div className="section-header">
                  <div className="section-title"><Link size={18} /><span>High Multi-Collinearity Features</span></div>
                  <div className="section-info">Identified relationships using a threshold of &gt;= {result.correlation.thresh}</div>
                </div>
                {result.correlation.pairs.length === 0 ? (
                  <div className="ok-icon-container">
                    <CheckCircle2 size={18} /><span>Excellent feature isolation! No severe collinearity detected.</span>
                  </div>
                ) : (
                  <div>
                    <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                      <table>
                        <thead>
                          <tr><th>Feature Vector A</th><th>Feature Vector B</th><th>Pearson Coeff (r)</th></tr>
                        </thead>
                        <tbody>
                          {result.correlation.pairs.map((p, idx) => (
                            <tr key={idx}>
                              <td><strong>{p.a}</strong></td>
                              <td><strong>{p.b}</strong></td>
                              <td><code style={{ color: 'hsl(354, 95%, 75%)', fontWeight: 600 }}>{p.r.toFixed(4)}</code></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <FixBox
                      issueType="correlation"
                      options={[
                        { value: 'Drop Redundant Columns', description: 'Automatically select and remove the feature with the highest overall correlation index' },
                        { value: 'Keep Both Features', description: 'Retain both multi-collinear vectors inside the current data sequence matrix' }
                      ]}
                      fixSelections={fixSelections}
                      setFixSelections={setFixSelections}
                      applyFix={applyFix}
                      fixLoading={fixLoading}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Constant Columns Tab ── */}
            {activeTab === 'constant' && (
              <div>
                <div className="section-header">
                  <div className="section-title"><ListFilter size={18} /><span>Constant Single-Value Features</span></div>
                  <div className="section-info">{result.constant.length} zero-variance vectors identified</div>
                </div>
                {result.constant.length === 0 ? (
                  <div className="ok-icon-container">
                    <CheckCircle2 size={18} /><span>Perfect! All columns express varying structural information.</span>
                  </div>
                ) : (
                  <div>
                    <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                      <table>
                        <thead>
                          <tr><th>Column Axis</th><th>Uniform Constant Value</th></tr>
                        </thead>
                        <tbody>
                          {result.constant.map((c, i) => (
                            <tr key={i}>
                              <td><strong>{c.col}</strong></td>
                              <td><code>{String(c.val)}</code></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <FixBox
                      issueType="constant"
                      options={[
                        { value: 'Drop Variance Deficiencies', description: 'Prune zero-variance feature tracks to maximize convergence processing speeds' },
                        { value: 'Retain Constant Frameworks', description: 'Retain invariant tracking attributes inside the processing arrays' }
                      ]}
                      fixSelections={fixSelections}
                      setFixSelections={setFixSelections}
                      applyFix={applyFix}
                      fixLoading={fixLoading}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Mixed Data Types Tab ── */}
            {activeTab === 'mixed' && (
              <div>
                <div className="section-header">
                  <div className="section-title"><Layers size={18} /><span>Mixed Schema Mismatches</span></div>
                  <div className="section-info">{Object.keys(result.mixed).length} multi-type columns encountered</div>
                </div>
                {Object.keys(result.mixed).length === 0 ? (
                  <div className="ok-icon-container">
                    <CheckCircle2 size={18} /><span>Excellent dataset health! Every column follows a uniform data type.</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {Object.entries(result.mixed).map(([col, types]) => (
                      <div key={col}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>{col} Schema Variations</div>
                        <div className="table-container">
                          <table>
                            <thead>
                              <tr><th>Detected Class Template</th><th>Occurrence Frequency</th><th>Percentage Scale</th></tr>
                            </thead>
                            <tbody>
                              {types.map((t, idx) => (
                                <tr key={idx}>
                                  <td><code>{t.type}</code></td>
                                  <td>{t.count}</td>
                                  <td>{t.pct}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <FixBox
                          issueType="mixed"
                          column={col}
                          options={[
                            { value: 'Cast to Majority Type', description: 'Force uniform coercion down the dominant architectural pipeline track type' },
                            { value: 'Convert Entirely to String', description: 'Re-encode all variants as literal string primitives safely' }
                          ]}
                          fixSelections={fixSelections}
                          setFixSelections={setFixSelections}
                          applyFix={applyFix}
                          fixLoading={fixLoading}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
