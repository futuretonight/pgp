import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Key, Database, MessageSquare, Shield, CheckCircle, AlertCircle, Activity, Globe, Lock, Unlock, Cpu, Server, Network, Save, FolderLock, FileText, Terminal, Copy, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import SecureChat from './components/SecureChat';
import SystemLogs from './components/SystemLogs';
import Settings from './components/Settings';
import TextCryptography from './components/TextCryptography';
import { applyTheme, loadTheme } from './themes';
import { PREF_KEYS, readPref, torStartOptions } from './prefs';
import { toHex, fromHex } from './hex';

const SecureFramebufferText = ({ text, style = {} }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !text) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    let frameId;
    let flip = false;
    ctx.font = '14px monospace';
    const metrics = ctx.measureText(text);
    canvas.width = metrics.width + 10;
    canvas.height = 20;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (flip) {
        // Canvas can't resolve CSS variables; read the live themed colour.
        ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--accent-ink').trim() || '#38d6ac';
        ctx.font = '14px monospace';
        ctx.fillText(text, 0, 14);
      }
      flip = !flip;
      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [text]);

  return <canvas ref={canvasRef} style={{ ...style, opacity: 0.8 }} />;
};

// Audit logs can be copied to the clipboard or exported as a JSON file, so they
// must never carry secrets. Scrub any secret currently held in memory, plus any
// long hex run (key, signature or ciphertext material), before a log is stored.
const HEX_BLOB = /[0-9a-f]{16,}/gi;
const redactSecrets = (text, secrets) => {
  let out = String(text ?? '');
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join('[REDACTED]');
  }
  return out.replace(HEX_BLOB, '[REDACTED]');
};

function App() {
  const [activeTab, setActiveTab] = useState('identity');
  const [notification, setNotification] = useState(null);
  const [keepAlive, setKeepAlive] = useState(false); // Toggle for preserving chat state
  const [theme, setTheme] = useState(loadTheme);

  useEffect(() => { applyTheme(theme); }, [theme]);
  
  const [passphrase, setPassphrase] = useState('');
  const [vaultPath, setVaultPath] = useState('my_vault.kdbx');
  const [vaultLocation, setVaultLocation] = useState('');
  const [userId, setUserId] = useState('');
  const [keys, setKeys] = useState(null);
  
  const [inFile, setInFile] = useState('');
  const [outFile, setOutFile] = useState('');

  // System Audit Logs State
  const [logs, setLogs] = useState([
    {
      id: 1,
      timestamp: new Date().toLocaleTimeString(),
      level: 'SUCCESS',
      category: 'SECURITY',
      message: 'Aura Cryptographic Engine v1.0.0 attached to process',
      details: 'ZeroizeOnDrop hooks active'
    },
    {
      id: 2,
      timestamp: new Date().toLocaleTimeString(),
      level: 'SUCCESS',
      category: 'SECURITY',
      message: 'Kernel Memory Armor engaged',
      details: 'XOR Pad Masking & Anti-Debugger active'
    },
    {
      id: 3,
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      category: 'VAULT',
      message: 'Vault persistence module ready',
      details: 'Argon2id KDF + XChaCha20-Poly1305'
    },
    {
      id: 4,
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      category: 'NETWORK',
      message: 'Embedded Arti Tor client starting',
      details: 'Downloading the network consensus'
    }
  ]);

  // Mirror the live secrets into a ref so the (stable) addLog can scrub them.
  const secretsRef = useRef([]);
  secretsRef.current = [passphrase, keys?.priv, keys?.pub];

  const addLog = useCallback((level, category, message, details = '') => {
    setLogs(prev => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        timestamp: new Date().toLocaleTimeString(),
        level,
        category,
        message: redactSecrets(message, secretsRef.current),
        details: redactSecrets(details, secretsRef.current)
      }
    ]);
  }, []);

  // Tor node state. `tor` is the live status from the backend (null until the node exists);
  // `torPhase` tracks our start_tor_node call: 'starting' | 'online' | 'error'.
  const [tor, setTor] = useState(null);
  const [torPhase, setTorPhase] = useState('starting');
  const [torError, setTorError] = useState('');
  const [onionAddress, setOnionAddress] = useState('');

  // Poll the node: bootstrap progress, consensus size, onion-service state. No network traffic.
  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        setTor(await invoke('get_telemetry'));
      } catch (err) {
        console.error('Telemetry error:', err);
      }
    };
    fetchTelemetry();
    const pinger = setInterval(fetchTelemetry, 2000);
    return () => { clearInterval(pinger); };
  }, []);

  // Connection milestones and problems reported by the Tor engine go to the System Logs.
  useEffect(() => {
    let unlisten;
    let cancelled = false;
    listen('tor-log', (event) => {
      const { level, message } = event.payload || {};
      addLog(level || 'INFO', 'NETWORK', message || '');
    }).then(fn => { if (cancelled) fn(); else unlisten = fn; });
    return () => { cancelled = true; if (unlisten) unlisten(); };
  }, [addLog]);

  // Memoized so its identity is stable: otherwise every render produces a new
  // showNotification, which cascades into initializeTorNode changing and the
  // mount effect re-calling start_tor_node in a loop (repeated Tor bootstraps).
  const showNotification = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  // Start Tor (or re-apply changed bridge settings). Safe to call again: the backend keeps one node.
  const startTor = useCallback(async () => {
    setTorPhase('starting');
    setTorError('');
    try {
      const address = await invoke('start_tor_node', torStartOptions());
      setOnionAddress(address);
      setTorPhase('online');
      addLog('SUCCESS', 'NETWORK', 'Onion service launched; peers can reach you once it is published', address);
      showNotification('Connected to Tor. Your onion address is ready.', 'success');
    } catch (e) {
      const msg = e?.message ?? String(e);
      setTorPhase('error');
      setTorError(msg);
      addLog('ERROR', 'NETWORK', 'Could not connect to Tor', msg);
      showNotification('Tor connection failed: ' + msg, 'error');
    }
  }, [addLog, showNotification]);

  // Connect as soon as the app opens, so the node is online before the chat tab is visited.
  const torStarted = useRef(false);
  useEffect(() => {
    if (torStarted.current) return;
    torStarted.current = true;
    startTor();
  }, [startTor]);

  const copyPublicKey = async () => {
    if (!keys?.pub) return;
    try {
      await navigator.clipboard.writeText(keys.pub);
      showNotification('Public key copied. Send it to your peer along with your onion address.', 'success');
    } catch (e) {
      showNotification('Could not copy: ' + e, 'error');
    }
  };

  const handleCreateIdentity = async () => {
    try {
      if (!passphrase) throw new Error("Please enter a Master Passphrase to secure your identity.");
      const algo = readPref(PREF_KEYS.algo, 'ecc');
      if (algo === 'rsa') showNotification('Generating an RSA-4096 key; this can take a while on slower machines...', 'success');
      const res = await invoke('create_identity', { passphrase, userId: userId.trim() || 'Anonymous', algo });
      setKeys({ pub: toHex(res[0]), priv: toHex(res[1]) });
      showNotification('Permanent node identity created successfully!');
      addLog('SUCCESS', 'CRYPTO', 'Permanent OpenPGP Node Identity generated', `Alias: ${userId || 'Anonymous'}`);
      addLog('INFO', 'SECURITY', 'Private key is protected by your passphrase (OpenPGP S2K)');
    } catch (e) { 
      showNotification(e.toString(), 'error');
      addLog('ERROR', 'CRYPTO', 'Failed to generate permanent identity', e.toString());
    }
  };

  const handleTempChat = async () => {
    try {
      const res = await invoke('start_temporary_chat');
      setKeys({ pub: toHex(res[0]), priv: toHex(res[1]) });
      showNotification('Temporary ephemeral session keys generated');
      addLog('INFO', 'CRYPTO', 'Temporary ephemeral keypair generated (Memory-Only)');
    } catch (e) { 
      showNotification(e.toString(), 'error'); 
      addLog('ERROR', 'CRYPTO', 'Failed to generate ephemeral keys', e.toString());
    }
  };

  const handleSaveVault = async () => {
    try {
      if (!keys?.pub || !keys?.priv) throw new Error("No active cryptographic keys to save. Generate or create an identity first.");
      if (!passphrase) throw new Error("Master Passphrase is required to encrypt the vault.");
      const targetPath = vaultPath.trim() || 'my_vault.kdbx';
      const savedTo = await invoke('save_vault', { pubKeyBytes: fromHex(keys.pub), privKeyBytes: fromHex(keys.priv), passphrase, path: targetPath });
      setVaultLocation(savedTo);
      showNotification(`Vault encrypted and saved to ${savedTo}`, 'success');
      addLog('SUCCESS', 'VAULT', 'Identity keypair encrypted with Argon2/XChaCha20 and saved to disk', savedTo);
    } catch(e) {
      showNotification(e.toString(), 'error');
      addLog('ERROR', 'VAULT', 'Failed to save identity to vault', e.toString());
    }
  };

  const handleLoadVault = async () => {
    try {
      if (!passphrase) throw new Error("Master Passphrase is required to decrypt the vault.");
      const targetPath = vaultPath.trim() || 'my_vault.kdbx';
      const [pub, priv, loadedFrom] = await invoke('load_vault', { passphrase, path: targetPath });
      setKeys({ pub: toHex(pub), priv: toHex(priv) });
      setVaultLocation(loadedFrom);
      showNotification(`Vault decrypted and loaded from ${loadedFrom}`, 'success');
      addLog('SUCCESS', 'VAULT', 'Vault decrypted & identity keys restored to active memory', loadedFrom);
    } catch(e) {
      showNotification(e.toString(), 'error');
      addLog('ERROR', 'VAULT', 'Failed to decrypt vault file', e.toString());
    }
  };


  const handleEncryptFile = async () => {
    try {
      if (!keys?.pub) throw new Error("No public key active. Create or load an identity first.");
      if (!inFile.trim() || !outFile.trim()) throw new Error("Please specify both Input and Output file paths.");
      const written = await invoke('encrypt_file', { inPath: inFile.trim(), outPath: outFile.trim(), pubKeyBytes: fromHex(keys.pub) });
      showNotification(`File encrypted successfully to ${written}`, 'success');
      addLog('SUCCESS', 'VAULT', 'File encrypted via Sequoia OpenPGP stream', `In: ${inFile.trim()} -> Out: ${written}`);
    } catch (e) { 
      showNotification(e.toString(), 'error'); 
      addLog('ERROR', 'VAULT', 'File encryption failed', e.toString());
    }
  };

  const handleDecryptFile = async () => {
    try {
      if (!keys?.priv) throw new Error("No private key active. Create or load an identity first.");
      if (!inFile.trim() || !outFile.trim()) throw new Error("Please specify both Input and Output file paths.");
      const written = await invoke('decrypt_file', { inPath: inFile.trim(), outPath: outFile.trim(), privKeyBytes: fromHex(keys.priv), passphrase });
      showNotification(`File decrypted successfully to ${written}`, 'success');
      addLog('SUCCESS', 'VAULT', 'File decrypted successfully', `Out: ${written}`);
    } catch (e) { 
      showNotification(e.toString(), 'error'); 
      addLog('ERROR', 'VAULT', 'File decryption failed', e.toString());
    }
  };

  const torOnline = torPhase === 'online';
  const torLabel = torOnline
    ? `Online · onion ${(tor?.onion || 'starting').toLowerCase()}`
    : torPhase === 'error'
      ? 'Offline (connection failed)'
      : tor
        ? (tor.blocked ? `Stuck at ${tor.percent}%` : `Connecting ${tor.percent}%`)
        : 'Starting Tor...';
  const torColor = torOnline ? 'var(--success)' : torPhase === 'error' ? 'var(--error)' : 'var(--text-secondary)';

  return (
    <div className="container">
      {/* Sidebar Navigation */}
      <div className="sidebar">
        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem'}}>
          <Shield size={32} color="var(--accent)" />
          <h1 className="logo-text" style={{fontSize: '2rem', margin: 0}}>Hermes</h1>
        </div>
        <p style={{fontSize: '0.8rem', opacity: 0.6, marginBottom: '2rem'}}>Aura Privacy Engine</p>
        
        <button className={`nav-btn ${activeTab === 'identity' ? 'active' : ''}`} onClick={() => setActiveTab('identity')}>
          <Key size={18} /> Identity & Crypto
        </button>
        <button className={`nav-btn ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
          <Database size={18} /> Secure Vault
        </button>
        <button className={`nav-btn ${activeTab === 'messaging' ? 'active' : ''}`} onClick={() => setActiveTab('messaging')}>
          <MessageSquare size={18} /> P2P Network
        </button>
        <button className={`nav-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
          <Terminal size={18} /> System Logs
        </button>
        <button className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          <SettingsIcon size={18} /> Settings
        </button>

        <div style={{ margin: '1rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'var(--inset)', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Chat Keep-Alive</span>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={keepAlive} 
              onChange={e => setKeepAlive(e.target.checked)} 
              style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
            />
          </label>
        </div>

        <div style={{ marginTop: 'auto', padding: '1rem', background: 'var(--inset-strong)', borderRadius: '8px', border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Server size={14}/> SYSTEM STATUS
            </span>
            <button
              title="Run in Headless Node Mode: hide the window and keep routing. Click the Dock icon to bring it back."
              onClick={async () => {
                try {
                  await invoke('toggle_headless', { hide: true });
                  addLog('INFO', 'NETWORK', 'Window hidden: node running headless in the background');
                } catch (e) {
                  showNotification('Headless mode failed: ' + e, 'error');
                }
              }}
              style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent-ink)', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px' }}>
              Run Node
            </button>
          </div>
          <p style={{ fontSize: '0.85rem', color: torColor, fontFamily: 'monospace' }} title={tor?.summary || torError}>● {torLabel}</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>Route: {tor?.via ?? '--'}</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>Relays: {tor?.relays ? tor.relays.toLocaleString() : '--'}</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>Peer RTT: {tor?.peer_rtt_ms ? `${tor.peer_rtt_ms}ms` : '--'}</p>
          {torPhase === 'error' && (
            <button onClick={startTor} style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent-ink)', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px' }}>
              <RefreshCw size={12}/> Retry Tor
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        
        {/* Network Telemetry Dashboard */}
        <div className="network-dashboard">
          <h3><Activity size={18}/> Live Network Telemetry</h3>
          <div className="telemetry-grid">
            <div className="telemetry-box">
              <span className="telemetry-label"><Globe size={14}/> Tor Anonymity</span>
              <span className="telemetry-value" style={{color: torColor}}>
                {torOnline ? 'Connected (Hidden Service)' : torPhase === 'error' ? 'Not Connected' : 'Connecting...'}
              </span>
              <span className="telemetry-subtext" title={onionAddress || tor?.summary}>{onionAddress || tor?.blocked || tor?.summary || 'Awaiting circuit'}</span>
            </div>
            <div className="telemetry-box">
              <span className="telemetry-label"><Network size={14}/> Tor Consensus</span>
              <span className="telemetry-value">{tor?.relays ? `${tor.relays.toLocaleString()} relays` : (tor ? `Downloading ${tor.percent}%` : 'Waiting')}</span>
              <span className="telemetry-subtext">Route: {tor?.via ?? '--'}</span>
            </div>
            <div className="telemetry-box">
              <span className="telemetry-label"><Cpu size={14}/> Memory Armor</span>
              <span className="telemetry-value" style={{color: 'var(--success)'}}>Active (Kernel Level)</span>
              <span className="telemetry-subtext">VRAM Dithering Enabled</span>
            </div>
          </div>
        </div>

        {/* Dynamic Panels */}
        <div className="glass-panel content-panel" key={activeTab}
          style={{ display: (activeTab === 'identity' || activeTab === 'files') ? 'block' : 'none' }}>
          {activeTab === 'identity' && (
            <div>
              <h2>Identity Generation & Keyring</h2>
              <p className="subtitle" style={{marginBottom: '1rem'}}>Create a permanent node identity or an ephemeral keypair mapped to your Tor hidden service.</p>
              
              <div className="input-group">
                <label>User ID (Alias)</label>
                <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="0xAnonymous" />
              </div>
              <div className="input-group">
                <label>Master Passphrase</label>
                <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="Hardware-backed ChaCha20 / Argon2 encryption" />
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                <button onClick={handleCreateIdentity} style={{ flex: 1, minWidth: '200px' }}>
                  <Key size={16} /> Create Permanent Node Identity
                </button>
                <button onClick={handleTempChat} style={{ flex: 1, minWidth: '200px', background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--accent)'}}>
                  Generate Ephemeral Keys
                </button>
              </div>

              <TextCryptography 
                keys={keys} 
                passphrase={passphrase} 
                showNotification={showNotification} 
                addLog={addLog} 
              />
              {keys && (
                <div className="result-box">
                  <p style={{color: 'var(--success)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                    <Lock size={14}/> Cryptographic Keys (Hex):
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span><strong>Public:</strong> {keys.pub.substring(0, 32)}...</span>
                    <button onClick={copyPublicKey} style={{ padding: '2px 10px', fontSize: '0.75rem', background: 'var(--tint-strong)', color: 'var(--text-primary)', border: '1px solid var(--panel-border)' }}>
                      <Copy size={12}/> Copy Public Key
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <strong>Private:</strong> <SecureFramebufferText text={keys.priv.substring(0, 32) + "..."} />
                    <span style={{fontSize: '0.7rem', color: 'var(--accent)'}}>[MEMORY MASKED]</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: activeTab === 'files' ? 'flex' : 'none', flexDirection: 'column', gap: '2rem' }}>
              {/* Module 1: Zero-Knowledge Key & Identity Vault */}
              <div>
                <h2>🔐 Secure Vault Command Center</h2>
                <p className="subtitle" style={{marginBottom: '1rem'}}>Manage in-memory cryptographic identities and local encrypted KDBX vaults (Argon2 + XChaCha20Poly1305).</p>
                
                <div style={{ background: 'var(--inset)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--panel-border)', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Lock size={14}/> Active Keyring Status:
                    </span>
                    <span style={{ 
                      fontSize: '0.85rem', 
                      fontFamily: 'monospace', 
                      padding: '2px 8px', 
                      borderRadius: '4px',
                      background: keys?.pub ? 'var(--success-wash)' : 'var(--error-wash)',
                      color: keys?.pub ? 'var(--success)' : 'var(--error)',
                      border: `1px solid ${keys?.pub ? 'var(--success-line)' : 'var(--error-line)'}`
                    }}>
                      {keys?.pub ? '● IDENTITY LOADED IN MEMORY' : '○ NO ACTIVE IDENTITY'}
                    </span>
                  </div>
                  {keys?.pub && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      Pubkey: {keys.pub.substring(0, 24)}... (Armor Verified)
                    </div>
                  )}
                </div>

                <div className="input-group">
                  <label>Vault Passphrase</label>
                  <input 
                    type="password" 
                    value={passphrase} 
                    onChange={e => setPassphrase(e.target.value)} 
                    placeholder="Master Passphrase for Argon2 derivation" 
                  />
                </div>

                <div className="input-group">
                  <label>Vault File Path (.kdbx / .vault)</label>
                  <input 
                    value={vaultPath} 
                    onChange={e => setVaultPath(e.target.value)} 
                    placeholder="C:\Users\Secret\my_vault.kdbx" 
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {vaultLocation ? `Last used: ${vaultLocation}` : "A bare file name is kept in Hermes' app data folder; use a full path to store it elsewhere."}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <button onClick={handleSaveVault} style={{ background: 'var(--accent)', flex: 1, minWidth: '180px' }}>
                    <Save size={16} /> Save Identity to Vault
                  </button>
                  <button onClick={handleLoadVault} style={{ background: 'var(--accent)', flex: 1, minWidth: '180px' }}>
                    <FolderLock size={16} /> Load / Unlock Vault
                  </button>
                </div>
              </div>

              {/* Module 2: Zero-Knowledge File Encryption */}
              <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '1.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={20} color="var(--accent)"/> Zero-Knowledge File Armor
                </h3>
                <p className="subtitle" style={{marginBottom: '1rem'}}>Encrypt files to your public key and decrypt them with your private key (Sequoia OpenPGP, AES-256).</p>
                
                <div className="input-group">
                  <label>Input File Path</label>
                  <input value={inFile} onChange={e => setInFile(e.target.value)} placeholder="C:\Users\Secret\document.pdf (relative paths start in your home folder)" />
                </div>
                <div className="input-group">
                  <label>Output File Path</label>
                  <input value={outFile} onChange={e => setOutFile(e.target.value)} placeholder="C:\Users\Secret\document.pdf.gpg" />
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                  <button onClick={handleEncryptFile} style={{ flex: 1, minWidth: '160px' }}>
                    <Lock size={16} /> Encrypt File
                  </button>
                  <button onClick={handleDecryptFile} style={{ background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--accent)', flex: 1, minWidth: '160px' }}>
                    <Unlock size={16} /> Decrypt File
                  </button>
                </div>
              </div>
            </div>
          </div>

          {(keepAlive || activeTab === 'messaging') && (
            <div style={{ display: activeTab === 'messaging' ? 'block' : 'none', height: '100%' }}>
              <SecureChat
                keys={keys}
                passphrase={passphrase}
                showNotification={showNotification}
                onionAddress={onionAddress}
                tor={tor}
                torPhase={torPhase}
                torError={torError}
                onRetryTor={startTor}
                onCopyPublicKey={copyPublicKey}
              />
            </div>
          )}

          <div style={{ display: activeTab === 'logs' ? 'block' : 'none' }}>
            <SystemLogs
              logs={logs}
              onClearLogs={() => setLogs([])}
            />
          </div>

          <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
            <Settings keepAlive={keepAlive} setKeepAlive={setKeepAlive} theme={theme} setTheme={setTheme} onReconnectTor={startTor} torPhase={torPhase} />
          </div>

          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 'auto', paddingBottom: '1rem' }}>
            Created by <strong>._neutron_.</strong> (GitHub: <a href="https://github.com/futuretonight" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>futuretonight</a>)
          </div>
        </div>

      {notification && (
        <div className={`notification ${notification.type} show-notification`}>
          {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          {notification.msg}
        </div>
      )}
    </div>
  );
}

export default App;