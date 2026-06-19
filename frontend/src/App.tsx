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
      if (!response.ok) {
        const errDetail = await response.json().catch(() => ({ detail: 'Unknown server error' }));
        throw new Error(errDetail.detail || 'Failed to analyze the dataset.');
      }
      const data: AnalysisResult = await response.json();
      console.log('file_id:', data.file_id);
      console.log('duplicates count:', data.duplicates.count);
      console.log('missing total:', data.missing.total);
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
      const response = await fetch('https://data-doctor-production-4bda.up.railway.app/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fileId, issue_type: issueType, column, option, extra_info: extraInfo }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail);
      }
      const data: AnalysisResult = await response.json();
      setResult(data);
      setFileId(data.file_id);
    } catch (err: any) {
      setError(err.message || 'Fix failed.');
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
            <button className="btn btn-secondary" onClick={resetApp} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
              <RefreshCw size={14} />
              <span>Upload New File</span>
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
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
                    {/* Fix boxes — one per column */}
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
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Duplicate Sample List (First 15 Rows)
                    </h4>
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
                    <CheckCircle2 size={18} /><span>Superb! No type mismatches, negative numbers, or invalid date values detected.</span>
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
                              {info.issues.map((issue, idx) => (
                                <tr key={idx}>
                                  <td><strong>{issue.row}</strong></td>
                                  <td><code>{issue.value}</code></td>
                                  <td style={{ color: 'hsl(354, 90%, 80%)' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                      <AlertTriangle size={12} />{issue.reason}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <FixBox
                          issueType="invalid"
                          column={col}
                          options={[
                            { value: 'Replace with NULL', description: 'Replace invalid values in this column with NULL/None' },
                            { value: 'Remove Rows', description: 'Remove rows that contain invalid values in this column' },
                            { value: 'Keep Values', description: 'Do nothing, keep invalid values as they are' },
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
                  <div className="section-title"><Flame size={18} /><span>Outliers Detection (IQR Method)</span></div>
                  <div className="section-info">{result.outliers.total} outlier cells detected in numeric columns</div>
                </div>
                {result.outliers.total === 0 ? (
                  <div className="ok-icon-container">
                    <CheckCircle2 size={18} /><span>Excellent! No numeric outliers found using Interquartile Range [Q1 - 1.5*IQR, Q3 + 1.5*IQR].</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {Object.entries(result.outliers.per).map(([col, info]) => (
                      <div key={col}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '1.05rem', fontWeight: 600 }}>{col}</span>
                          <span className="badge badge-warning">{info.count} Outliers ({info.pct}%)</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Bounds: <code>[{info.lb}, {info.ub}]</code> &middot; Q1: <code>{info.q1}</code> &middot; Q3: <code>{info.q3}</code>
                          </span>
                        </div>
                        <div className="table-container" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                          <table>
                            <thead><tr><th>Outlier Row Indexes &amp; Values (Sample)</th></tr></thead>
                            <tbody>
                              <tr>
                                <td style={{ wordBreak: 'break-all', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  {info.rows.map((r, ri) => (
                                    <span key={ri} style={{ marginRight: '16px', display: 'inline-block' }}>
                                      Row {r.row}: <strong style={{ color: 'hsl(38, 95%, 75%)' }}>{r.value}</strong>
                                    </span>
                                  ))}
                                  {info.count > info.rows.length && (
                                    <span style={{ color: 'var(--text-muted)' }}>+ {info.count - info.rows.length} more outliers</span>
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <FixBox
                          issueType="outliers"
                          column={col}
                          options={[
                            { value: 'Remove Outliers', description: 'Delete rows where this column\'s value falls outside the IQR bounds' },
                            { value: 'Cap to IQR Bounds', description: 'Clamp outlier values to the lower/upper IQR bounds instead of removing them' },
                            { value: 'Keep Values', description: 'Do nothing, keep outliers as they are' },
                          ]}
                          fixSelections={fixSelections}
                          setFixSelections={setFixSelections}
                          applyFix={applyFix}
                          fixLoading={fixLoading}
                        />
                      </div>
                    ))}
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Outlier Counts by Column
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {Object.entries(result.outliers.per).map(([col, info]) => (
                          <div key={col} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: '150px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '0.85rem', fontWeight: 500 }}>{col}</div>
                            <div style={{ flex: 1 }}>
                              <div className="bar-track">
                                <div className="bar-fill" style={{ width: `${Math.min(100, (info.count / result.n) * 100 * 5)}%`, background: 'var(--color-warning)' }}></div>
                                <div className="bar-label-overlay">{info.count} outlier cell(s) ({info.pct}%)</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Class Imbalance Tab ── */}
            {activeTab === 'imbalance' && (
              <div>
                <div className="section-header">
                  <div className="section-title"><Layers size={18} /><span>Class Imbalance Analysis</span></div>
                  <div className="section-info">Column: <strong>{result.imbalance.col}</strong></div>
                </div>
                {!result.imbalance.col ? (
                  <div className="ok-icon-container" style={{ background: 'var(--bg-info)', color: 'hsl(200, 95%, 75%)', borderColor: 'hsla(200, 95%, 50%, 0.2)' }}>
                    <Info size={18} /><span>No target column could be identified or auto-selected (minimum 2 classes needed).</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Minority/Majority class ratio:</span>
                      <span className={`badge ${result.imbalance.ratio < 0.3 ? 'badge-danger' : result.imbalance.ratio < 0.6 ? 'badge-warning' : 'badge-success'}`}>
                        {result.imbalance.ratio}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(Values below 0.3 represent critical imbalance)</span>
                    </div>
                    <div className="table-container" style={{ marginBottom: '2rem' }}>
                      <table>
                        <thead><tr><th>Class Value</th><th>Frequency Count</th><th>Percentage</th></tr></thead>
                        <tbody>
                          {result.imbalance.classes.map((cls, i) => (
                            <tr key={i}>
                              <td><strong>{cls.cls}</strong></td>
                              <td>{cls.count}</td>
                              <td>{cls.pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Class Distribution
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {result.imbalance.classes.map((cls, i) => {
                          const colors = ['#1D9E75', '#378ADD', '#D85A30', '#BA7517', '#9B59B6', '#E24B4A', '#639922', '#185FA5'];
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <div style={{ width: '150px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '0.85rem', fontWeight: 500 }}>{cls.cls}</div>
                              <div style={{ flex: 1 }}>
                                <div className="bar-track">
                                  <div className="bar-fill" style={{ width: `${cls.pct}%`, background: colors[i % colors.length] }}></div>
                                  <div className="bar-label-overlay">{cls.count} ({cls.pct}%)</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <FixBox
                      issueType="imbalance"
                      options={[
                        { value: 'Oversample Minority Class', description: 'Randomly duplicate minority class rows until all classes are balanced' },
                        { value: 'Undersample Majority Class', description: 'Randomly remove majority class rows until all classes are balanced' },
                        { value: 'Keep Distribution', description: 'Do nothing, keep the class distribution as it is' },
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
                  <div className="section-title"><Link size={18} /><span>Correlation Analysis (Pearson r)</span></div>
                  <div className="section-info">Threshold: <strong>&ge; {result.correlation.thresh}</strong></div>
                </div>
                {result.correlation.cols.length < 2 ? (
                  <div className="ok-icon-container" style={{ background: 'var(--bg-info)', color: 'hsl(200, 95%, 75%)', borderColor: 'hsla(200, 95%, 50%, 0.2)' }}>
                    <Info size={18} /><span>Analysis requires at least 2 numerical columns. Detected columns: {result.correlation.cols.length}.</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      Identified <strong>{result.correlation.pairs.length}</strong> highly correlated column pairs.
                    </div>
                    {result.correlation.pairs.length > 0 && (
                      <>
                        <div className="table-container" style={{ marginBottom: '1rem' }}>
                          <table>
                            <thead><tr><th>Column A</th><th>Column B</th><th>Pearson r Coefficient</th></tr></thead>
                            <tbody>
                              {result.correlation.pairs.map((pair, idx) => (
                                <tr key={idx}>
                                  <td><strong>{pair.a}</strong></td>
                                  <td><strong>{pair.b}</strong></td>
                                  <td>
                                    <span className={`badge ${Math.abs(pair.r) >= 0.95 ? 'badge-danger' : 'badge-warning'}`}>{pair.r}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Fix box per correlated pair */}
                        {result.correlation.pairs.map((pair, idx) => (
                          <FixBox
                            key={idx}
                            issueType="correlation"
                            column={pair.a}
                            options={[
                              { value: 'Remove First Column', description: `Drop column "${pair.a}" from the dataset` },
                              { value: 'Remove Second Column', description: `Drop column "${pair.b}" from the dataset` },
                              { value: 'Keep Both', description: 'Do nothing, keep both correlated columns' },
                            ]}
                            fixSelections={fixSelections}
                            setFixSelections={setFixSelections}
                            applyFix={applyFix}
                            fixLoading={fixLoading}
                            extraInfo={{ column_b: pair.b }}
                          />
                        ))}
                      </>
                    )}
                    <div style={{ marginTop: '2rem' }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Pearson Correlation Matrix Heatmap
                      </h4>
                      <div className="heatmap-container">
                        <div className="heatmap-label-row">
                          {result.correlation.cols.map(c => (
                            <div key={c} className="heatmap-column-header" title={c}>{c}</div>
                          ))}
                        </div>
                        {result.correlation.cols.map(c1 => (
                          <div key={c1} className="heatmap-row">
                            <div className="heatmap-row-header" title={c1}>{c1}</div>
                            {result.correlation.cols.map(c2 => {
                              const val = result.correlation.matrix[c1]?.[c2];
                              const r = val !== null && val !== undefined ? val : 0;
                              const alpha = val !== null ? Math.max(0.1, Math.abs(r)) : 0.05;
                              const bgStyle = val !== null
                                ? (r > 0 ? `rgba(29, 158, 117, ${alpha})` : `rgba(226, 75, 74, ${alpha})`)
                                : 'rgba(255,255,255,0.02)';
                              const txtColor = Math.abs(r) > 0.6 ? '#ffffff' : 'var(--text-secondary)';
                              return (
                                <div key={c2} className="heatmap-cell" style={{ background: bgStyle, color: txtColor }}>
                                  {val !== null ? r.toFixed(2) : '-'}
                                  <div className="tooltip">{c1} &times; {c2} = {val !== null ? r.toFixed(4) : 'N/A'}</div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Constant Columns Tab ── */}
            {activeTab === 'constant' && (
              <div>
                <div className="section-header">
                  <div className="section-title"><Info size={18} /><span>Constant Columns</span></div>
                  <div className="section-info">{result.constant.length} redundant columns detected</div>
                </div>
                {result.constant.length === 0 ? (
                  <div className="ok-icon-container">
                    <CheckCircle2 size={18} /><span>Perfect! All columns contain at least two unique values. No redundant constants.</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      The following columns contain only a single unique value. They provide no variance or predictive value for training ML models and can be dropped.
                    </div>
                    <div className="table-container">
                      <table>
                        <thead><tr><th>Column Name</th><th>Constant Value</th></tr></thead>
                        <tbody>
                          {result.constant.map((c, idx) => (
                            <tr key={idx}>
                              <td><strong>{c.col}</strong></td>
                              <td><code>{c.val}</code></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {result.constant.map((c, idx) => (
                      <FixBox
                        key={idx}
                        issueType="constant"
                        column={c.col}
                        options={[
                          { value: 'Remove Column', description: `Drop "${c.col}" — it has no variance and provides no information` },
                          { value: 'Keep Column', description: 'Do nothing, keep the constant column' },
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

            {/* ── Mixed Types Tab ── */}
            {activeTab === 'mixed' && (
              <div>
                <div className="section-header">
                  <div className="section-title"><Layers size={18} /><span>Mixed Data Types</span></div>
                  <div className="section-info">{Object.keys(result.mixed).length} multi-typed columns detected</div>
                </div>
                {Object.keys(result.mixed).length === 0 ? (
                  <div className="ok-icon-container">
                    <CheckCircle2 size={18} /><span>Awesome! All columns contain consistent data types (excluding missing values).</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ marginBottom: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      The following columns contain values of different primary types. It is recommended to clean or cast them before model training.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                      {Object.entries(result.mixed).map(([col, types]) => (
                        <div key={col}>
                          <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{col}</h4>
                          <div className="table-container">
                            <table>
                              <thead>
                                <tr><th>Data Type</th><th>Cell Count</th><th>Percentage</th><th>Sample Row Indexes</th></tr>
                              </thead>
                              <tbody>
                                {types.map((t, idx) => (
                                  <tr key={idx}>
                                    <td><span className="badge badge-info">{t.type}</span></td>
                                    <td>{t.count}</td>
                                    <td>{t.pct}%</td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.rows.join(', ')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <FixBox
                            issueType="mixed"
                            column={col}
                            options={[
                              { value: 'Convert to Numeric', description: 'Force-convert the column to numeric; non-numeric values become NULL' },
                              { value: 'Convert Entire Column to String', description: 'Convert all values in the column to string type' },
                              { value: 'Keep As Is', description: 'Do nothing, keep mixed types as they are' },
                            ]}
                            fixSelections={fixSelections}
                            setFixSelections={setFixSelections}
                            applyFix={applyFix}
                            fixLoading={fixLoading}
                          />
                        </div>
                      ))}
                    </div>
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
