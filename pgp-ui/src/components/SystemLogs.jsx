import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Terminal, Shield, Download, Trash2, Search, Filter, Play, Pause, Copy, Check, Activity, Lock, Cpu, Network, Database, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';

export default function SystemLogs({ logs = [], onClearLogs, onAddLog }) {
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
  const handleCopyLogs = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.level}] [${l.category}] ${l.message} ${l.details ? '(' + l.details + ')' : ''}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper badge color
  const getLevelColor = (level) => {
    switch (level) {
      case 'SUCCESS': return 'var(--success)';
      case 'ERROR': return 'var(--error)';
      case 'WARN': return '#f59e0b';
      case 'INFO':
      default:
        return 'var(--accent)';
    }
  };

  const getLevelIcon = (level) => {
    switch (level) {
      case 'SUCCESS': return <CheckCircle size={13} color="var(--success)"/>;
      case 'ERROR': return <AlertCircle size={13} color="var(--error)"/>;
      case 'WARN': return <AlertTriangle size={13} color="#f59e0b"/>;
      case 'INFO':
      default:
        return <Info size={13} color="var(--accent)"/>;
    }
  };

  const getCategoryColor = (cat) => {
    switch (cat) {
      case 'CRYPTO': return '#8b5cf6';
      case 'VAULT': return '#10b981';
      case 'NETWORK': return '#3b82f6';
      case 'SECURITY': return '#ec4899';
      default: return '#94a3b8';
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
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--panel-border)', padding: '6px 12px', fontSize: '12px' }}
              title="Copy all logs to clipboard"
            >
              {copied ? <Check size={14} color="var(--success)"/> : <Copy size={14}/>}
              {copied ? 'Copied' : 'Copy'}
            </button>

            <button 
              onClick={handleExportLogs}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--panel-border)', padding: '6px 12px', fontSize: '12px' }}
              title="Export logs as JSON file"
            >
              <Download size={14}/> Export
            </button>

            <button 
              onClick={onClearLogs}
              style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--error)', padding: '6px 12px', fontSize: '12px' }}
              title="Clear log buffer"
            >
              <Trash2 size={14}/> Clear
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
        
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Events</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{metrics.total}</div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '11px', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Crypto Ops</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, fontFamily: 'monospace', color: '#8b5cf6' }}>{metrics.crypto}</div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '11px', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vault I/O</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, fontFamily: 'monospace', color: '#10b981' }}>{metrics.vault}</div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '11px', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>P2P / Mesh</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, fontFamily: 'monospace', color: '#3b82f6' }}>{metrics.network}</div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '11px', color: '#ec4899', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Memory Armor</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, fontFamily: 'monospace', color: '#ec4899' }}>Active</div>
        </div>

      </div>

      {/* Control Bar: Filters & Search */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(0,0,0,0.25)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
        
        {/* Search */}
        <div style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', background: '#0d1117', borderRadius: '6px', border: '1px solid var(--panel-border)', padding: '0 8px' }}>
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
                background: categoryFilter === cat ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                color: categoryFilter === cat ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${categoryFilter === cat ? 'var(--accent)' : 'transparent'}`
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Auto Scroll Toggle */}
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            borderRadius: '4px',
            background: autoScroll ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)',
            color: autoScroll ? 'var(--success)' : 'var(--text-secondary)',
            border: `1px solid ${autoScroll ? 'rgba(16, 185, 129, 0.3)' : 'var(--panel-border)'}`
          }}
        >
          {autoScroll ? <Play size={11}/> : <Pause size={11}/>}
          {autoScroll ? 'Auto-Scroll ON' : 'Paused'}
        </button>

      </div>

      {/* Main Terminal Window */}
      <div style={{
        background: '#070a12',
        borderRadius: '8px',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: '12px',
        height: '420px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6)'
      }}>
        
        {/* Terminal Header */}
        <div style={{
          padding: '8px 12px',
          background: '#0e1320',
          borderBottom: '1px solid var(--panel-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}></span>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }}></span>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }}></span>
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
            <div style={{ margin: 'auto', textAlign: 'center', color: '#4b5563', padding: '2rem' }}>
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
                  background: 'rgba(255, 255, 255, 0.015)',
                  lineHeight: '1.4'
                }}
              >
                {/* Timestamp */}
                <span style={{ color: '#64748b', fontSize: '11px', flexShrink: 0 }}>
                  [{log.timestamp}]
                </span>

                {/* Level Icon */}
                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginTop: '2px' }}>
                  {getLevelIcon(log.level)}
                </span>

                {/* Category Pill */}
                <span style={{
                  color: getCategoryColor(log.category),
                  background: `${getCategoryColor(log.category)}18`,
                  border: `1px solid ${getCategoryColor(log.category)}33`,
                  fontSize: '10px',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontWeight: 600,
                  flexShrink: 0
                }}>
                  {log.category}
                </span>

                {/* Message */}
                <span style={{ color: '#e2e8f0', flex: 1, wordBreak: 'break-word' }}>
                  {log.message}
                  {log.details && (
                    <span style={{ color: '#94a3b8', marginLeft: '6px', fontSize: '11px' }}>
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
