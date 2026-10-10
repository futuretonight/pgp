import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Terminal, Download, Trash2, Search, Play, Pause, Copy, Check, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';

export default function SystemLogs({ logs = [], onClearLogs }) {
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);

  const logsEndRef = useRef(null);

  // Auto-scroll to bottom on new log arrival
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Filtered logs calculation
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchCategory = categoryFilter === 'ALL' || log.category === categoryFilter;
      const matchLevel = levelFilter === 'ALL' || log.level === levelFilter;
      const matchSearch = !searchQuery.trim() || 
        log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.details && log.details.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCategory && matchLevel && matchSearch;
    });
  }, [logs, categoryFilter, levelFilter, searchQuery]);

  // Metrics summary
  const metrics = useMemo(() => {
    return {
      total: logs.length,
      crypto: logs.filter(l => l.category === 'CRYPTO').length,
      vault: logs.filter(l => l.category === 'VAULT').length,
      network: logs.filter(l => l.category === 'NETWORK').length,
      security: logs.filter(l => l.category === 'SECURITY').length,
      errors: logs.filter(l => l.level === 'ERROR').length
    };
  }, [logs]);

  // Export logs to downloadable file
  const handleExportLogs = () => {
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hermes_audit_logs_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy raw logs to clipboard
  const handleCopyLogs = async () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.level}] [${l.category}] ${l.message} ${l.details ? '(' + l.details + ')' : ''}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const getLevelIcon = (level) => {
    switch (level) {
      case 'SUCCESS': return <CheckCircle size={13} color="var(--success)"/>;
      case 'ERROR': return <AlertCircle size={13} color="var(--error)"/>;
      case 'WARN': return <AlertTriangle size={13} color="var(--warn)"/>;
      case 'INFO':
      default:
        return <Info size={13} color="var(--accent)"/>;
    }
  };

  const getCategoryColor = (cat) => {
    switch (cat) {
      case 'CRYPTO': return 'var(--accent)';
      case 'VAULT': return 'var(--accent)';
      case 'NETWORK': return 'var(--accent)';
      case 'SECURITY': return 'var(--accent)';
      default: return 'var(--text-secondary)';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header & Description */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Terminal size={24} color="var(--accent)"/> Real-Time System & Security Logs
            </h2>
            <p className="subtitle" style={{ marginBottom: 0 }}>
              Live telemetry, cryptographic proof verification, Zero-Knowledge vault audits, and Tor/P2P routing events.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button 
              onClick={handleCopyLogs}
              style={{ background: 'var(--tint)', color: 'var(--text-primary)', border: '1px solid var(--panel-border)', padding: '6px 12px', fontSize: '12px' }}
              title="Copy all logs to clipboard"
            >
              {copied ? <Check size={14} color="var(--success)"/> : <Copy size={14}/>}
              {copied ? 'Copied' : 'Copy'}
            </button>

            <button 
              onClick={handleExportLogs}
              style={{ background: 'var(--tint)', color: 'var(--text-primary)', border: '1px solid var(--panel-border)', padding: '6px 12px', fontSize: '12px' }}
              title="Export logs as JSON file"
            >
              <Download size={14}/> Export
            </button>

            <button 
              onClick={onClearLogs}
              style={{ background: 'var(--error-wash)', border: '1px solid var(--error-line)', color: 'var(--error)', padding: '6px 12px', fontSize: '12px' }}
              title="Clear log buffer"
            >
              <Trash2 size={14}/> Clear
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
        
        <div style={{ background: 'var(--inset-strong)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Events</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{metrics.total}</div>
        </div>

        <div style={{ background: 'var(--inset-strong)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Crypto Ops</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--accent)' }}>{metrics.crypto}</div>
        </div>

        <div style={{ background: 'var(--inset-strong)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vault I/O</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--accent)' }}>{metrics.vault}</div>
        </div>

        <div style={{ background: 'var(--inset-strong)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>P2P / Mesh</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--accent)' }}>{metrics.network}</div>
        </div>

        <div style={{ background: 'var(--inset-strong)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Memory Armor</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--accent)' }}>Active</div>
        </div>

      </div>

      {/* Control Bar: Filters & Search */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', background: 'var(--inset)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
        
        {/* Search */}
        <div style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', background: 'var(--surface-2)', borderRadius: '6px', border: '1px solid var(--panel-border)', padding: '0 8px' }}>
          <Search size={14} color="var(--text-secondary)"/>
          <input 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search audit trail by keyword, hash, or action..."
            style={{ border: 'none', background: 'transparent', width: '100%', padding: '6px 8px', fontSize: '12px' }}
          />
        </div>

        {/* Category Filter */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {['ALL', 'CRYPTO', 'VAULT', 'NETWORK', 'SECURITY'].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                borderRadius: '4px',
                background: categoryFilter === cat ? 'var(--accent-wash)' : 'transparent',
                color: categoryFilter === cat ? 'var(--accent-ink)' : 'var(--text-secondary)',
                border: `1px solid ${categoryFilter === cat ? 'var(--accent)' : 'transparent'}`
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Level Filter */}
        <select
          value={levelFilter}
          onChange={e => setLevelFilter(e.target.value)}
          aria-label="Filter by level"
          style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--panel-border)' }}
        >
          {['ALL', 'SUCCESS', 'INFO', 'WARN', 'ERROR'].map(l => <option key={l} value={l}>{l === 'ALL' ? 'All levels' : l}</option>)}
        </select>

        {/* Auto Scroll Toggle */}
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            borderRadius: '4px',
            background: autoScroll ? 'var(--success-wash)' : 'var(--tint)',
            color: autoScroll ? 'var(--success)' : 'var(--text-secondary)',
            border: `1px solid ${autoScroll ? 'var(--success-line)' : 'var(--panel-border)'}`
          }}
        >
          {autoScroll ? <Play size={11}/> : <Pause size={11}/>}
          {autoScroll ? 'Auto-Scroll ON' : 'Paused'}
        </button>

      </div>

      {/* Main Terminal Window */}
      <div style={{
        background: 'var(--bg-color)',
        borderRadius: '8px',
        border: '1px solid var(--accent-line)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: '12px',
        height: '420px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-inset)'
      }}>
        
        {/* Terminal Header */}
        <div style={{
          padding: '8px 12px',
          background: 'var(--surface-2)',
          borderBottom: '1px solid var(--panel-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--error)' }}></span>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--warn)' }}></span>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent)' }}></span>
            <span style={{ marginLeft: '8px', color: 'var(--text-secondary)', fontSize: '11px' }}>hermes-core://system_audit.log</span>
          </div>

          <div style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
            Showing {filteredLogs.length} of {logs.length} entries
          </div>
        </div>

        {/* Terminal Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          {filteredLogs.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--line-strong)', padding: '2rem' }}>
              <Terminal size={32} opacity={0.3} style={{ marginBottom: '8px' }}/>
              <p>No matching system events found.</p>
            </div>
          ) : (
            filteredLogs.map(log => (
              <div 
                key={log.id} 
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  background: 'var(--tint-faint)',
                  lineHeight: '1.4'
                }}
              >
                {/* Timestamp */}
                <span style={{ color: 'var(--text-secondary)', fontSize: '11px', flexShrink: 0 }}>
                  [{log.timestamp}]
                </span>

                {/* Level Icon */}
                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginTop: '2px' }}>
                  {getLevelIcon(log.level)}
                </span>

                {/* Category Pill */}
                <span style={{
                  color: getCategoryColor(log.category),
                  background: `color-mix(in srgb, ${getCategoryColor(log.category)} 10%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${getCategoryColor(log.category)} 20%, transparent)`,
                  fontSize: '10px',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontWeight: 600,
                  flexShrink: 0
                }}>
                  {log.category}
                </span>

                {/* Message */}
                <span style={{ color: 'var(--text-primary)', flex: 1, wordBreak: 'break-word' }}>
                  {log.message}
                  {log.details && (
                    <span style={{ color: 'var(--text-secondary)', marginLeft: '6px', fontSize: '11px' }}>
                      ({log.details})
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

      </div>

    </div>
  );
}
