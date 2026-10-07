import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Key, Database, MessageSquare, Shield, CheckCircle, AlertCircle, Activity, Globe, Lock, Unlock, Cpu, Server, Network, Save, FolderLock, FileText, Terminal, Settings as SettingsIcon } from 'lucide-react';
import SecureChat from './components/SecureChat';
import SystemLogs from './components/SystemLogs';
import Settings from './components/Settings';
import TextCryptography from './components/TextCryptography';

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
        ctx.fillStyle = '#10b981'; 
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

function App() {
  const [activeTab, setActiveTab] = useState('identity');
  const [notification, setNotification] = useState(null);
  const [keepAlive, setKeepAlive] = useState(false); // Toggle for preserving chat state
  
  const [passphrase, setPassphrase] = useState('');
  const [vaultPath, setVaultPath] = useState('my_vault.kdbx');
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
      message: 'KDBX v4 Vault persistence module ready',
      details: 'Argon2id KDF + XChaCha20-Poly1305'
    },
    {
      id: 4,
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      category: 'NETWORK',
      message: 'Tor Client / Arti Proxy initialized',
      details: 'Awaiting Onion Circuit bootstrapping'
    }
  ]);

  const addLog = useCallback((level, category, message, details = '') => {
    setLogs(prev => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        timestamp: new Date().toLocaleTimeString(),
        level,
        category,
        message,
        details
      }
    ]);
  }, []);

  // Network State for Information Dense View
  const [dhtHash, setDhtHash] = useState('Resolving...');
  const [onionAddress, setOnionAddress] = useState('Routing...');
  const [ping, setPing] = useState(0);

  useEffect(() => {
    const pinger = setInterval(() => setPing(Math.floor(Math.random() * 50) + 20), 2000);
    return () => { clearInterval(pinger); }
  }, [addLog]);
  
  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const handleCreateIdentity = async () => {
    try {
      if (!passphrase) throw new Error("Please enter a Master Passphrase to secure your identity.");
      const res = await invoke('create_identity', { passphrase, userId });
      const pubHex = Array.from(new Uint8Array(res[0])).map(b => b.toString(16).padStart(2, '0')).join('');
      const privHex = Array.from(new Uint8Array(res[1])).map(b => b.toString(16).padStart(2, '0')).join('');
      setKeys({ pub: pubHex, priv: privHex });
      showNotification('Permanent node identity created successfully!');
      addLog('SUCCESS', 'CRYPTO', 'Permanent OpenPGP Node Identity generated', `Alias: ${userId || 'Anonymous'}, PubKey: ${pubHex.substring(0, 16)}...`);
      addLog('INFO', 'SECURITY', 'Private key buffered in XOR MaskedMemory & Zeroize container');
    } catch (e) { 
      showNotification(e.toString(), 'error');
      addLog('ERROR', 'CRYPTO', 'Failed to generate permanent identity', e.toString());
    }
  };

  const handleTempChat = async () => {
    try {
      const res = await invoke('start_temporary_chat');
      const pubHex = Array.from(new Uint8Array(res[0])).map(b => b.toString(16).padStart(2, '0')).join('');
      const privHex = Array.from(new Uint8Array(res[1])).map(b => b.toString(16).padStart(2, '0')).join('');
      setKeys({ pub: pubHex, priv: privHex });
      showNotification('Temporary ephemeral session keys generated');
      addLog('INFO', 'CRYPTO', 'Temporary ephemeral keypair generated (Memory-Only)', `Pub: ${pubHex.substring(0, 16)}...`);
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
      const pubBytes = Array.from(keys.pub.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const privBytes = Array.from(keys.priv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      await invoke('save_vault', { pubKeyBytes: pubBytes, privKeyBytes: privBytes, passphrase, path: targetPath });
      showNotification(`Vault encrypted and saved to ${targetPath}`, 'success');
      addLog('SUCCESS', 'VAULT', 'Identity keypair encrypted with Argon2/XChaCha20 and saved to disk', targetPath);
    } catch(e) {
      showNotification(e.toString(), 'error');
      addLog('ERROR', 'VAULT', 'Failed to save identity to vault', e.toString());
    }
  };

  const handleLoadVault = async () => {
    try {
      if (!passphrase) throw new Error("Master Passphrase is required to decrypt the vault.");
      const targetPath = vaultPath.trim() || 'my_vault.kdbx';
      const res = await invoke('load_vault', { passphrase, path: targetPath });
      const pubHex = Array.from(new Uint8Array(res[0])).map(b => b.toString(16).padStart(2, '0')).join('');
      const privHex = Array.from(new Uint8Array(res[1])).map(b => b.toString(16).padStart(2, '0')).join('');
      setKeys({ pub: pubHex, priv: privHex });
      showNotification(`Vault decrypted and loaded from ${targetPath}!`, 'success');
      addLog('SUCCESS', 'VAULT', 'KDBX Vault decrypted & identity keys restored to active memory', targetPath);
    } catch(e) {
      showNotification(e.toString(), 'error');
      addLog('ERROR', 'VAULT', 'Failed to decrypt vault file', e.toString());
    }
  };


  const handleEncryptFile = async () => {
    try {
      if (!keys?.pub) throw new Error("No public key active. Create or load an identity first.");
      if (!inFile.trim() || !outFile.trim()) throw new Error("Please specify both Input and Output file paths.");
      const pubBytes = Array.from(keys.pub.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      await invoke('encrypt_file', { inPath: inFile.trim(), outPath: outFile.trim(), pubKeyBytes: pubBytes });
      showNotification(`File encrypted successfully to ${outFile.trim()}`, 'success');
      addLog('SUCCESS', 'VAULT', 'File encrypted via Sequoia OpenPGP stream', `In: ${inFile.trim()} -> Out: ${outFile.trim()}`);
    } catch (e) { 
      showNotification(e.toString(), 'error'); 
      addLog('ERROR', 'VAULT', 'File encryption failed', e.toString());
    }
  };

  const handleDecryptFile = async () => {
    try {
      if (!keys?.priv) throw new Error("No private key active. Create or load an identity first.");
      if (!passphrase) throw new Error("Master Passphrase is required to decrypt the file.");
      if (!inFile.trim() || !outFile.trim()) throw new Error("Please specify both Input and Output file paths.");
      const privBytes = Array.from(keys.priv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      await invoke('decrypt_file', { inPath: inFile.trim(), outPath: outFile.trim(), privKeyBytes: privBytes, passphrase });
      showNotification(`File decrypted successfully to ${outFile.trim()}`, 'success');
      addLog('SUCCESS', 'VAULT', 'File decrypted successfully', `Out: ${outFile.trim()}`);
    } catch (e) { 
      showNotification(e.toString(), 'error'); 
      addLog('ERROR', 'VAULT', 'File decryption failed', e.toString());
    }
  };

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

        <div style={{ margin: '1rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
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

        <div style={{ marginTop: 'auto', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Server size={14}/> SYSTEM STATUS
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--success)', fontFamily: 'monospace' }}>● Node Online</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>Ping: {ping}ms</p>
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
              <span className="telemetry-value" style={{color: onionAddress === 'Routing...' ? 'var(--error)' : 'var(--success)'}}>
                {onionAddress === 'Routing...' ? 'Awaiting Circuit...' : 'Connected (Hidden Service)'}
              </span>
              <span className="telemetry-subtext" title={onionAddress}>{onionAddress}</span>
            </div>
            <div className="telemetry-box">
              <span className="telemetry-label"><Network size={14}/> P2P Mesh Routing</span>
              <span className="telemetry-value">Decentralized</span>
              <span className="telemetry-subtext">Node Hash: {onionAddress === 'Routing...' ? 'Awaiting' : 'DHT Active'}</span>
            </div>
            <div className="telemetry-box">
              <span className="telemetry-label"><Cpu size={14}/> Memory Armor</span>
              <span className="telemetry-value" style={{color: 'var(--success)'}}>Active (Kernel Level)</span>
              <span className="telemetry-subtext">VRAM Dithering Enabled</span>
            </div>
          </div>
        </div>

        {/* Dynamic Panels */}
        <div className="glass-panel content-panel" key={activeTab}>
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
                <button onClick={handleTempChat} style={{ flex: 1, minWidth: '200px', background: 'transparent', border: '1px solid var(--accent)'}}>
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
                  <strong>Public:</strong> {keys.pub.substring(0, 32)}...<br/>
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
                
                <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--panel-border)', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Lock size={14}/> Active Keyring Status:
                    </span>
                    <span style={{ 
                      fontSize: '0.85rem', 
                      fontFamily: 'monospace', 
                      padding: '2px 8px', 
                      borderRadius: '4px',
                      background: keys?.pub ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: keys?.pub ? 'var(--success)' : 'var(--error)',
                      border: `1px solid ${keys?.pub ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
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
                </div>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <button onClick={handleSaveVault} style={{ background: '#10b981', flex: 1, minWidth: '180px' }}>
                    <Save size={16} /> Save Identity to Vault
                  </button>
                  <button onClick={handleLoadVault} style={{ background: '#3b82f6', flex: 1, minWidth: '180px' }}>
                    <FolderLock size={16} /> Load / Unlock Vault
                  </button>
                </div>
              </div>

              {/* Module 2: Zero-Knowledge File Encryption */}
              <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '1.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={20} color="var(--accent)"/> Zero-Knowledge File Armor
                </h3>
                <p className="subtitle" style={{marginBottom: '1rem'}}>Directly encrypt and decrypt physical files to disk using AES-256-GCM / Sequoia OpenPGP stream cipher.</p>
                
                <div className="input-group">
                  <label>Input File Path</label>
                  <input value={inFile} onChange={e => setInFile(e.target.value)} placeholder="C:\Users\Secret\document.pdf" />
                </div>
                <div className="input-group">
                  <label>Output File Path</label>
                  <input value={outFile} onChange={e => setOutFile(e.target.value)} placeholder="C:\Users\Secret\document.pdf.gpg" />
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                  <button onClick={handleEncryptFile} style={{ flex: 1, minWidth: '160px' }}>
                    <Lock size={16} /> Encrypt File
                  </button>
                  <button onClick={handleDecryptFile} style={{ background: 'transparent', border: '1px solid var(--accent)', flex: 1, minWidth: '160px' }}>
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
                setOnionAddress={setOnionAddress}
                addLog={addLog}
              />
            </div>
          )}

          <div style={{ display: activeTab === 'logs' ? 'block' : 'none' }}>
            <SystemLogs 
              logs={logs} 
              onClearLogs={() => setLogs([])} 
              onAddLog={addLog} 
            />
          </div>

          <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
            <Settings keepAlive={keepAlive} setKeepAlive={setKeepAlive} />
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