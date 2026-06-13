import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';

export default function ImportWizard() {
  const { id } = useParams();
  const groupId = parseInt(id, 10);
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Wizard Steps: 'upload' | 'queue' | 'report'
  const [step, setStep] = useState('upload');

  // Step 1: Upload Configuration State
  const [exchangeRate, setExchangeRate] = useState('83.00');
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Step 2: Queue State
  const [importLogId, setImportLogId] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [resolutions, setResolutions] = useState({});

  // Step 3: Success Report State
  const [report, setReport] = useState(null);

  useEffect(() => {
    apiFetch(`/api/groups/${groupId}`)
      .then(data => {
        setGroup(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading group:', err);
        setError('Failed to load group metadata.');
        setLoading(false);
      });
  }, [groupId]);

  // Handle file import locally
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(event.target.result);
    };
    reader.readAsText(file);
  };

  // Upload and analyze CSV file
  const handleUpload = async () => {
    if (!csvText) {
      setError('Please select a valid CSV file.');
      return;
    }
    setError('');
    setSubmitting(true);

    try {
      const data = await apiFetch('/api/import/upload', {
        method: 'POST',
        body: JSON.stringify({
          groupId,
          csvText,
          exchangeRate: parseFloat(exchangeRate) || 83,
          fileName: fileName || 'expenses_export.csv'
        })
      });

      setImportLogId(data.importLogId);
      setAnomalies(data.anomalies);
      setParsedRows(data.parsedRows);

      // Prepopulate default resolutions based on policies
      const defaultResolutions = {};
      data.anomalies.forEach(anomaly => {
        const key = `${anomaly.rowNumber}_${anomaly.anomalyType}`;
        if (anomaly.anomalyType === 'DUPLICATE_ROW') {
          defaultResolutions[key] = 'skip'; // Option B: skip duplicate
        } else if (anomaly.anomalyType === 'MISSING_PAYER') {
          defaultResolutions[key] = ''; // requires user mapping selection
        } else if (anomaly.anomalyType === 'NAME_VARIANCE') {
          // Pre-select if we can map it case-insensitively
          const lowerName = anomaly.rawValue.trim().toLowerCase();
          let guessedEmail = '';
          if (lowerName.includes('priya')) guessedEmail = 'priya@splitlet.com';
          else if (lowerName.includes('rohan')) guessedEmail = 'rohan@splitlet.com';
          else if (lowerName.includes('aisha')) guessedEmail = 'aisha@splitlet.com';
          else if (lowerName.includes('meera')) guessedEmail = 'meera@splitlet.com';
          else if (lowerName.includes('sam')) guessedEmail = 'sam@splitlet.com';
          else if (lowerName.includes('dev')) guessedEmail = 'dev@splitlet.com';
          defaultResolutions[key] = guessedEmail;
        } else if (anomaly.anomalyType === 'MEMBERSHIP_TIME_VIOLATION') {
          defaultResolutions[key] = 'remove'; // Option A: remove Meera, scale splits
        } else if (anomaly.anomalyType === 'PERCENTAGE_SUM_ERROR') {
          defaultResolutions[key] = 'scale'; // auto-scale splits to 100%
        } else if (anomaly.anomalyType === 'SETTLEMENT_LOGGED_AS_EXPENSE') {
          defaultResolutions[key] = 'settlement'; // Option B: import as settlement
        } else if (anomaly.anomalyType === 'NEGATIVE_REFUND') {
          defaultResolutions[key] = 'invert'; // Option B: invert payer/splits
        }
      });

      setResolutions(defaultResolutions);
      setStep('queue');
    } catch (err) {
      setError(err.message || 'Error processing CSV upload.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolutionChange = (key, val) => {
    setResolutions(prev => ({ ...prev, [key]: val }));
  };

  // Submit approved/resolved items to backend database
  const handleResolveAndImport = async () => {
    // Validate that all missing payers or name variances have been resolved
    const unresolved = anomalies.some(anomaly => {
      const key = `${anomaly.rowNumber}_${anomaly.anomalyType}`;
      if (anomaly.anomalyType === 'MISSING_PAYER' && !resolutions[key]) return true;
      if (anomaly.anomalyType === 'NAME_VARIANCE' && !resolutions[key]) return true;
      return false;
    });

    if (unresolved) {
      setError('Please resolve all missing payers and name variances before importing.');
      window.scrollTo(0, 0);
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const approvedRows = [];

      // Process row by row applying resolutions
      for (const row of parsedRows) {
        let skipRow = false;
        let finalRow = { ...row };

        // Check anomalies affecting this row
        const rowAnomalies = anomalies.filter(a => a.rowNumber === row.rowNumber);

        for (const anomaly of rowAnomalies) {
          const key = `${anomaly.rowNumber}_${anomaly.anomalyType}`;
          const res = resolutions[key];

          if (anomaly.anomalyType === 'DUPLICATE_ROW' && res === 'skip') {
            skipRow = true;
          } else if (anomaly.anomalyType === 'MISSING_PAYER') {
            finalRow.payerEmail = res;
          } else if (anomaly.anomalyType === 'NAME_VARIANCE') {
            finalRow.payerEmail = res;
          } else if (anomaly.anomalyType === 'MEMBERSHIP_TIME_VIOLATION' && res === 'skip') {
            skipRow = true;
          } else if (anomaly.anomalyType === 'MEMBERSHIP_TIME_VIOLATION' && res === 'remove') {
            // Remove Meera (or violating member) from splits
            const violator = anomaly.rawValue;
            finalRow.splitWith = finalRow.splitWith.filter(u => u !== violator);
          } else if (anomaly.anomalyType === 'PERCENTAGE_SUM_ERROR' && res === 'equal') {
            finalRow.splitType = 'equal';
          } else if (anomaly.anomalyType === 'SETTLEMENT_LOGGED_AS_EXPENSE' && res === 'settlement') {
            finalRow.isSettlement = true;
          } else if (anomaly.anomalyType === 'NEGATIVE_REFUND' && res === 'invert') {
            // Invert refund to positive debt
            // Payer becomes split receiver (first participant)
            const origPayer = finalRow.paidBy;
            const receiver = finalRow.splitWith[0] || 'Aisha';
            finalRow.payerEmail = receiver.toLowerCase().includes('friend') ? 'dev@splitlet.com' : `${receiver.toLowerCase()}@splitlet.com`;
            finalRow.splitWith = [origPayer];
            finalRow.isNegative = false;
            finalRow.amountCentsOriginal = Math.abs(finalRow.amountCentsOriginal);
          }
        }

        if (!skipRow) {
          approvedRows.push(finalRow);
        }
      }

      const response = await apiFetch(`/api/import/queue/${importLogId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          groupId,
          approvedRows,
          exchangeRate: parseFloat(exchangeRate) || 83
        })
      });

      setReport(response);
      setStep('report');
    } catch (err) {
      setError(err.message || 'Error committing resolutions to ledger.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }}>Loading import wizard...</div>;
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header" style={{ marginBottom: '16px' }}>
        <Link to="/" className="logo-section">
          <div className="logo-icon">S</div>
          <span>Splitlet</span>
        </Link>
        <Link to={`/group/${groupId}`} className="btn btn-secondary">
          ← Back to Ledger
        </Link>
      </header>

      {/* Progress Wizard Header */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>CSV Import Tool</span>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <h2 style={{ fontSize: '18px', fontWeight: 600 }}>{group?.name}</h2>
        </div>
        <div style={{ display: 'flex', gap: '20px', fontSize: '14px', fontWeight: 500 }}>
          <span style={{ color: step === 'upload' ? 'var(--primary)' : 'var(--text-muted)' }}>1. Ingestion Config</span>
          <span style={{ color: step === 'queue' ? 'var(--primary)' : 'var(--text-muted)' }}>2. Approval Queue</span>
          <span style={{ color: step === 'report' ? 'var(--primary)' : 'var(--text-muted)' }}>3. Success Report</span>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: '24px', padding: '12px 16px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', color: '#f87171' }}>{error}</div>}

      {/* STEP 1: UPLOAD SECTION */}
      {step === 'upload' && (
        <div className="glass-panel" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Upload Expenses Sheet</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
            Ingest your CSV file. The system will parse date types, clean comma numbers, and detect anomalies based on our validation policy.
          </p>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>
              1. Choose CSV Export File
            </label>
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleFileChange} 
              style={{ display: 'block', width: '100%', padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--panel-border)', borderRadius: '10px', color: 'var(--text-primary)', cursor: 'pointer' }}
            />
            {fileName && (
              <p style={{ fontSize: '13px', color: 'var(--accent-green)', marginTop: '6px' }}>✓ Loaded: {fileName}</p>
            )}
          </div>

          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>
              2. USD to INR Exchange Rate (Priya's Conversion)
            </label>
            <input 
              type="number" 
              step="0.01" 
              value={exchangeRate} 
              onChange={(e) => setExchangeRate(e.target.value)} 
              style={{ display: 'block', width: '120px', padding: '10px 14px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '16px' }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
              Used to convert all $ USD expenses into local INR base currency ledger values.
            </span>
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%' }}
            onClick={handleUpload}
            disabled={submitting || !csvText}
          >
            {submitting ? 'Analyzing CSV...' : 'Verify & Analyze CSV'}
          </button>
        </div>
      )}

      {/* STEP 2: APPROVAL QUEUE (MEERA'S APPROVAL WORKFLOW) */}
      {step === 'queue' && (
        <div>
          <div className="glass-panel" style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>Meera's Ingestion Approval Queue</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              We discovered <strong>{anomalies.length} anomalies</strong>. Review the suggested fixes and approve the ledger modifications below. No data will be written until you click <strong>Approve & Import</strong>.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
            {anomalies.map((anomaly, idx) => {
              const key = `${anomaly.rowNumber}_${anomaly.anomalyType}`;
              const selectedVal = resolutions[key];

              // Pick color schemes based on anomaly type severity
              let accentColor = '#3b82f6';
              let bgColor = 'rgba(59, 130, 246, 0.05)';
              if (anomaly.anomalyType === 'MISSING_PAYER' || anomaly.anomalyType === 'MEMBERSHIP_TIME_VIOLATION') {
                accentColor = 'var(--danger)';
                bgColor = 'rgba(239, 68, 68, 0.05)';
              } else if (anomaly.anomalyType === 'DUPLICATE_ROW' || anomaly.anomalyType === 'PERCENTAGE_SUM_ERROR') {
                accentColor = '#f59e0b';
                bgColor = 'rgba(245, 158, 11, 0.05)';
              }

              return (
                <div key={idx} className="glass-panel" style={{ borderLeft: `4px solid ${accentColor}`, background: bgColor, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                        Row {anomaly.rowNumber}
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: accentColor, textTransform: 'uppercase', tracking: '0.5px' }}>
                        {anomaly.anomalyType.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '4px' }}>
                      Anomaly Field: <strong style={{ color: 'var(--text-primary)' }}>{anomaly.fieldName}</strong> &middot; Raw Value: <code>"{anomaly.rawValue || 'N/A'}"</code>
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Proposed Fix: <span style={{ color: 'var(--accent-green)' }}>{anomaly.proposedFix}</span>
                    </p>
                  </div>

                  {/* Dynamic Action Selector based on anomaly policy */}
                  <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      Resolve Action:
                    </label>

                    {anomaly.anomalyType === 'DUPLICATE_ROW' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          className={`btn ${selectedVal === 'skip' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                          onClick={() => handleResolutionChange(key, 'skip')}
                        >
                          Skip Duplicate
                        </button>
                        <button 
                          className={`btn ${selectedVal === 'keep' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                          onClick={() => handleResolutionChange(key, 'keep')}
                        >
                          Keep Both
                        </button>
                      </div>
                    )}

                    {anomaly.anomalyType === 'MISSING_PAYER' && (
                      <select 
                        value={selectedVal} 
                        onChange={(e) => handleResolutionChange(key, e.target.value)}
                        style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                      >
                        <option value="">-- Choose Payer --</option>
                        {group?.members.map(m => (
                          <option key={m.id} value={m.email}>{m.name} ({m.email})</option>
                        ))}
                      </select>
                    )}

                    {anomaly.anomalyType === 'NAME_VARIANCE' && (
                      <select 
                        value={selectedVal} 
                        onChange={(e) => handleResolutionChange(key, e.target.value)}
                        style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                      >
                        <option value="">-- Map Alias --</option>
                        {group?.members.map(m => (
                          <option key={m.id} value={m.email}>{m.name}</option>
                        ))}
                      </select>
                    )}

                    {anomaly.anomalyType === 'MEMBERSHIP_TIME_VIOLATION' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          className={`btn ${selectedVal === 'remove' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                          onClick={() => handleResolutionChange(key, 'remove')}
                        >
                          Remove Member
                        </button>
                        <button 
                          className={`btn ${selectedVal === 'skip' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                          onClick={() => handleResolutionChange(key, 'skip')}
                        >
                          Skip Row
                        </button>
                      </div>
                    )}

                    {anomaly.anomalyType === 'PERCENTAGE_SUM_ERROR' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          className={`btn ${selectedVal === 'scale' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                          onClick={() => handleResolutionChange(key, 'scale')}
                        >
                          Auto Scale (100%)
                        </button>
                        <button 
                          className={`btn ${selectedVal === 'equal' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                          onClick={() => handleResolutionChange(key, 'equal')}
                        >
                          Split Equally
                        </button>
                      </div>
                    )}

                    {anomaly.anomalyType === 'SETTLEMENT_LOGGED_AS_EXPENSE' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          className={`btn ${selectedVal === 'settlement' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                          onClick={() => handleResolutionChange(key, 'settlement')}
                        >
                          Settlement
                        </button>
                        <button 
                          className={`btn ${selectedVal === 'expense' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                          onClick={() => handleResolutionChange(key, 'expense')}
                        >
                          Expense
                        </button>
                      </div>
                    )}

                    {anomaly.anomalyType === 'NEGATIVE_REFUND' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          className={`btn ${selectedVal === 'invert' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                          onClick={() => handleResolutionChange(key, 'invert')}
                        >
                          Invert Payer/Splits
                        </button>
                        <button 
                          className={`btn ${selectedVal === 'keep' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                          onClick={() => handleResolutionChange(key, 'keep')}
                        >
                          Keep Original
                        </button>
                      </div>
                    )}

                    {anomaly.anomalyType === 'USD_CONVERSION' && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.15)', padding: '6px 10px', borderRadius: '6px' }}>
                        ✓ Converting using {exchangeRate} rate.
                      </div>
                    )}

                    {anomaly.anomalyType === 'CASE_WHITESPACE_VARIANCE' && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.15)', padding: '6px 10px', borderRadius: '6px' }}>
                        ✓ Automatically cleaning trailing spaces.
                      </div>
                    )}

                    {anomaly.anomalyType === 'DATE_FORMAT_INCONSISTENCY' && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.15)', padding: '6px 10px', borderRadius: '6px' }}>
                        ✓ Standardizing format.
                      </div>
                    )}

                    {anomaly.anomalyType === 'AMBIGUOUS_DATE' && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.15)', padding: '6px 10px', borderRadius: '6px' }}>
                        ✓ Resolving to DD/MM/YYYY.
                      </div>
                    )}

                    {anomaly.anomalyType === 'FRACTIONAL_CENTS' && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.15)', padding: '6px 10px', borderRadius: '6px' }}>
                        ✓ Rounding fractional cents.
                      </div>
                    )}

                    {anomaly.anomalyType === 'MISSING_CURRENCY' && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.15)', padding: '6px 10px', borderRadius: '6px' }}>
                        ✓ Defaulting to INR.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={() => setStep('upload')}>
              Back
            </button>
            <button className="btn btn-primary" onClick={handleResolveAndImport} disabled={submitting}>
              {submitting ? 'Importing Rows...' : 'Approve & Import to Ledger'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: SUCCESS AUDIT REPORT */}
      {step === 'report' && (
        <div className="glass-panel" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--primary)', width: '64px', height: '64px', borderRadius: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', color: 'var(--primary)', margin: '0 auto 20px' }}>
            ✓
          </div>
          <h3 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Ingestion Approved & Saved!</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
            Meera's approval workflow complete. The database has committed the transaction successfully.
          </p>

          <div className="glass-panel" style={{ background: 'rgba(0,0,0,0.15)', padding: '16px', marginBottom: '28px', textAlign: 'left' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '10px' }}>Ledger Ingest Summary</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
              <span>Imported Records Count:</span>
              <strong>{report?.validRows || 0} rows</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
              <span>Base currency:</span>
              <strong>INR (₹)</strong>
            </div>
          </div>

          <Link to={`/group/${groupId}`} className="btn btn-primary" style={{ width: '100%' }}>
            Return to Group Ledger
          </Link>
        </div>
      )}
    </div>
  );
}
