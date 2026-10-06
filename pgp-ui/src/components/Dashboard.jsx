import React, { useState, useEffect } from 'react';
import './Dashboard.css';

export default function Dashboard() {
  const [logs, setLogs] = useState([
    "► System Initialized...",
    "► Tor Circuit: ESTABLISHED (Node 192.x)",
    "► Key Vault: LOCKED (2 Identities)",
  ]);

  useEffect(() => {
    // Fake "live" feeling
    const timer = setInterval(() => {
      setLogs(prev => ["► Signal heartbeat ping...", ...prev.slice(0, 4)])
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="dash-interface">
      {/* 1. HERO STATUS - The Big glowing status */}
      <section className="status-hero">
        <div className="hero-content">
          <h1 className="glitch-text">HERMES://ONLINE</h1>
          <div className="pulse-indicator">
            <div className="pulse-ring"></div>
            <span style={{color: '#0f0', fontWeight: 'bold'}}>ENCRYPTED UPLINK ACTIVE</span>
          </div>
        </div>
      </section>

      {/* 2. SPLIT MODULES */}
      <div className="module-grid">
        
        {/* Module A: Network Log (Terminal Style) */}
        <div className="tactical-module">
          <div className="mod-header">/// LIVE_EVENT_LOG</div>
          <div className="terminal-feed">
            {logs.map((log, i) => (
              <div key={i} className="log-line" style={{opacity: 1 - (i * 0.2)}}>
                {log}
              </div>
            ))}
          </div>
        </div>

        {/* Module B: Identity & Stats */}
        <div className="tactical-module">
          <div className="mod-header">/// SYSTEM_INTEGRITY</div>
          <div className="stats-row">
            <div className="stat-box">
              <span className="label">PLAINTEXT EXPOSURE</span>
              <span className="val secure">0.00%</span>
            </div>
            <div className="stat-box">
              <span className="label">KEYS LOADED</span>
              <span className="val">2</span>
            </div>
          </div>
          
          <button className="tactical-btn">
            BROADCAST SIGNATURE
          </button>
        </div>

      </div>
    </div>
  );
}
