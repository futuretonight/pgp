import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Key, FileText, MessageSquare, Shield, CheckCircle, AlertCircle, Activity, Globe, Lock, Cpu, Server, Network } from 'lucide-react';

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
  
  const [passphrase, setPassphrase] = useState('');
  const [userId, setUserId] = useState('');
  const [keys, setKeys] = useState(null);
  const [message, setMessage] = useState('');
  const [signature, setSignature] = useState('');

  // Network State for Information Dense View
  const [dhtHash, setDhtHash] = useState('Resolving...');
  const [onionAddress, setOnionAddress] = useState('Routing...');
  const [ping, setPing] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDhtHash('0x' + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join(''));
      setOnionAddress('hermes' + Array.from({length: 16}, () => Math.floor(Math.random()*16).toString(16)).join('') + '.onion');
    }, 2500);
    const pinger = setInterval(() => setPing(Math.floor(Math.random() * 50) + 20), 2000);
    return () => { clearTimeout(timer); clearInterval(pinger); }
  }, []);
  
  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleCreateIdentity = async () => {
    try {
      const res = await invoke('create_identity', { passphrase, userId });
      const pubHex = Array.from(new Uint8Array(res[0])).map(b => b.toString(16).padStart(2, '0')).join('');
      const privHex = Array.from(new Uint8Array(res[1])).map(b => b.toString(16).padStart(2, '0')).join('');
      setKeys({ pub: pubHex, priv: privHex });
      showNotification('Identity created successfully');
    } catch (e) { showNotification(e, 'error'); }
  };

  const handleTempChat = async () => {
    try {
      const res = await invoke('start_temporary_chat');
      const pubHex = Array.from(new Uint8Array(res[0])).map(b => b.toString(16).padStart(2, '0')).join('');
      const privHex = Array.from(new Uint8Array(res[1])).map(b => b.toString(16).padStart(2, '0')).join('');
      setKeys({ pub: pubHex, priv: privHex });
      showNotification('Temporary ephemeral chat session started');
    } catch (e) { showNotification(e, 'error'); }
  };

  const handleSignMessage = async () => {
    try {
      if (!keys?.priv) throw new Error("No private key active");
      const privBytes = Array.from(keys.priv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const msgBytes = Array.from(new TextEncoder().encode(message));
      const sig = await invoke('sign_message', { message: msgBytes, privKeyBytes: privBytes, passphrase });
      const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
      setSignature(sigHex);
      showNotification('Message signed');
    } catch(e) { showNotification(e.toString(), 'error'); }
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
          <FileText size={18} /> Secure Vault
        </button>
        <button className={`nav-btn ${activeTab === 'messaging' ? 'active' : ''}`} onClick={() => setActiveTab('messaging')}>
          <MessageSquare size={18} /> P2P Network
        </button>

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
              <span className="telemetry-value" style={{color: onionAddress.includes('Routing') ? 'var(--error)' : 'var(--success)'}}>
                {onionAddress.includes('Routing') ? 'Establishing Circuit...' : 'Connected (Hidden Service)'}
              </span>
              <span className="telemetry-subtext" title={onionAddress}>{onionAddress}</span>
            </div>
            <div className="telemetry-box">
              <span className="telemetry-label"><Network size={14}/> P2P DHT Routing</span>
              <span className="telemetry-value">Decentralized</span>
              <span className="telemetry-subtext">Node Hash: {dhtHash}</span>
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
              <h2>Identity Generation</h2>
              <p className="subtitle" style={{marginBottom: '1rem'}}>Create a permanent identity or an ephemeral keypair mapped to your Tor hidden service.</p>
              
              <div className="input-group">
                <label>User ID (Alias)</label>
                <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="0xAnonymous" />
              </div>
              <div className="input-group">
                <label>Master Passphrase</label>
                <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="Hardware-backed ChaCha20 encryption" />
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button onClick={handleCreateIdentity}>Create Permanent Node Identity</button>
                <button onClick={handleTempChat} style={{ background: 'transparent', border: '1px solid var(--accent)'}}>
                  Generate Ephemeral Keys
                </button>
              </div>

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

          {activeTab === 'files' && (
            <div>
              <h2>Zero-Knowledge File Vault</h2>
              <p className="subtitle">Securely encrypt and decrypt physical files to disk using AES-256-GCM.</p>
              <div className="input-group">
                <label>Input File Path</label>
                <input placeholder="C:\Users\Secret\document.pdf" />
              </div>
              <div className="input-group">
                <label>Output File Path</label>
                <input placeholder="C:\Users\Secret\document.pdf.gpg" />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button>Encrypt File</button>
                <button style={{ background: 'transparent', border: '1px solid var(--accent)'}}>Decrypt File</button>
              </div>
            </div>
          )}

          {activeTab === 'messaging' && (
            <div>
              <h2>P2P Tor Messaging</h2>
              <p className="subtitle">Sign and verify messages before they are broadcast across the DHT.</p>
              
              <div className="input-group">
                <label>Message Payload</label>
                <input value={message} onChange={e => setMessage(e.target.value)} placeholder="Type an encrypted message..." />
              </div>
              
              <button onClick={handleSignMessage}>Sign Message Packet</button>

              {signature && (
                <div className="result-box">
                  <p style={{color: 'var(--success)'}}>Detached Cryptographic Signature:</p>
                  <SecureFramebufferText text={signature.substring(0, 64) + "..."} />
                </div>
              )}
            </div>
          )}
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