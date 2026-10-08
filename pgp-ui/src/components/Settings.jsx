import React, { useState } from 'react';
import { Settings as SettingsIcon, Shield, Cpu, Lock, Key, Server, Hash, Globe } from 'lucide-react';

export default function Settings({ keepAlive, setKeepAlive }) {
  const [algo, setAlgo] = useState(() => localStorage.getItem('hermes_algo') || 'ecc');
  const [cipher, setCipher] = useState(() => localStorage.getItem('hermes_cipher') || 'aes');
  const [v3Only, setV3Only] = useState(() => localStorage.getItem('hermes_v3') !== 'false');
  const [useBridges, setUseBridges] = useState(() => localStorage.getItem('hermes_use_bridges') === 'true');
  const [bridgeType, setBridgeType] = useState(() => localStorage.getItem('hermes_bridge_type') || 'obfs4');
  const [bridgeSource, setBridgeSource] = useState(() => localStorage.getItem('hermes_bridge_source') || 'builtin');
  const [bridgeString, setBridgeString] = useState(() => localStorage.getItem('hermes_bridge_string') || '');
  const [volunteerProxy, setVolunteerProxy] = useState(() => localStorage.getItem('hermes_volunteer') === 'true');
  const [requestedBridges, setRequestedBridges] = useState(() => localStorage.getItem('hermes_requested_bridges') || window.requestedBridges || '');
  const [isRequestingBridges, setIsRequestingBridges] = useState(false);

  React.useEffect(() => {
    localStorage.setItem('hermes_algo', algo);
    localStorage.setItem('hermes_cipher', cipher);
    localStorage.setItem('hermes_v3', v3Only);
    localStorage.setItem('hermes_use_bridges', useBridges);
    localStorage.setItem('hermes_bridge_type', bridgeType);
    localStorage.setItem('hermes_bridge_source', bridgeSource);
    localStorage.setItem('hermes_bridge_string', bridgeString);
    localStorage.setItem('hermes_volunteer', volunteerProxy);
    if (requestedBridges) {
      localStorage.setItem('hermes_requested_bridges', requestedBridges);
    }
  }, [algo, cipher, v3Only, useBridges, bridgeType, bridgeSource, bridgeString, volunteerProxy, requestedBridges]);

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '18px' }}>
          <SettingsIcon size={20} color="var(--accent)" /> System & Cryptographic Settings
        </h2>
        <p className="subtitle" style={{ marginBottom: '2rem' }}>
          Configure the low-level parameters for the Aura Cryptographic Engine and the Tor Arti client.
        </p>

        {/* Security / Memory Settings */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <Cpu size={16} color="var(--success)"/> Memory & App Behavior
          </h3>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
            
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Chat Keep-Alive (Memory Persistence)</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  If disabled, navigating away from the P2P tab will trigger immediate zeroization of the chat memory buffers.
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={keepAlive} 
                  onChange={e => setKeepAlive(e.target.checked)} 
                  style={{ accentColor: 'var(--accent)', width: '18px', height: '18px' }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Strict ZeroizeOnDrop (Kernel)</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Hardware-level memory scrubbing for private keys upon drop is natively active.
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'default' }}>
                <input type="checkbox" checked readOnly style={{ accentColor: 'var(--accent)', width: '18px', height: '18px' }} />
              </label>
            </div>

          </div>
        </div>

        {/* PGP Engine Settings */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <Key size={16} color="var(--accent)"/> OpenPGP Engine Parameters
          </h3>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            <div className="input-group">
              <label>Default Asymmetric Key Algorithm</label>
              <select value={algo} onChange={e => setAlgo(e.target.value)} style={{ background: '#0d1117', border: '1px solid var(--panel-border)', color: '#fff', padding: '10px', borderRadius: '6px' }}>
                <option value="ecc">ECC (Ed25519 Signing / Cv25519 Encryption) - Recommended</option>
                <option value="rsa">RSA (4096-bit) - Legacy</option>
                <option value="nist">NIST P-384 - Suite B</option>
              </select>
              <span style={{ fontSize: '0.75rem', color: algo === 'ecc' ? 'var(--text-secondary)' : '#ef4444', marginTop: '0.25rem' }}>
                {algo === 'ecc' 
                  ? '* Changing this requires generating a new Node Identity.' 
                  : '⚠️ WARNING: You have selected a legacy or non-standard algorithm. This may compromise anonymity or be incompatible with standard nodes.'}
              </span>
            </div>

            <div className="input-group">
              <label>Symmetric File Encryption Cipher</label>
              <select value={cipher} onChange={e => setCipher(e.target.value)} style={{ background: '#0d1117', border: '1px solid var(--panel-border)', color: '#fff', padding: '10px', borderRadius: '6px' }}>
                <option value="aes">AES-256-GCM (Hardware Accelerated)</option>
                <option value="xchacha">XChaCha20-Poly1305</option>
              </select>
            </div>

          </div>
        </div>

        {/* Network Settings */}
        <div>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <Server size={16} color="#8b5cf6"/> Arti Tor Mesh Network
          </h3>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
            
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Force V3 Onion Services Only</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Reject legacy V2 connections. V3 provides better cryptography and longer addresses.
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={v3Only} 
                  onChange={e => setV3Only(e.target.checked)} 
                  style={{ accentColor: 'var(--accent)', width: '18px', height: '18px' }} 
                />
              </label>
            </div>

            <div className="input-group">
              <label>Local Proxy Bind Port</label>
              <input type="text" value="Random (Ephemeral)" disabled style={{ background: '#0d1117', border: '1px solid var(--panel-border)', color: '#fff', padding: '10px', borderRadius: '6px', opacity: 0.7 }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                The internal Tor client dynamically assigns ports to prevent fingerprinting.
              </span>
            </div>

          </div>
        </div>

        {/* Anti-Censorship (Pluggable Transports) */}
        <div>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <Globe size={16} color="var(--accent)"/> Anti-Censorship & Bridges
          </h3>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: useBridges ? '1.5rem' : '1.25rem' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Use Tor Bridges (obfs4 / snowflake)</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Bypass national firewalls by disguising Tor traffic as regular HTTPS or WebRTC video calls.
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={useBridges} 
                  onChange={e => setUseBridges(e.target.checked)} 
                  style={{ accentColor: 'var(--accent)', width: '18px', height: '18px' }} 
                />
              </label>
            </div>

            {useBridges && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--panel-border)' }}>
                
                {/* Option 1: Built-in */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <input 
                    type="radio" 
                    name="bridgeSource"
                    checked={bridgeSource === 'builtin'} 
                    onChange={() => setBridgeSource('builtin')} 
                    style={{ marginTop: '0.25rem', accentColor: 'var(--accent)' }} 
                  />
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: bridgeSource === 'builtin' ? '#fff' : 'var(--text-secondary)' }}>Select a built-in bridge</span>
                    <select 
                      value={bridgeType} 
                      onChange={e => setBridgeType(e.target.value)} 
                      disabled={bridgeSource !== 'builtin'}
                      style={{ background: '#0d1117', border: '1px solid var(--panel-border)', color: bridgeSource === 'builtin' ? '#fff' : 'var(--text-secondary)', padding: '6px 10px', borderRadius: '4px', width: '220px' }}>
                      <option value="obfs4">obfs4</option>
                      <option value="snowflake">Snowflake</option>
                      <option value="meek">meek-azure</option>
                    </select>
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)', margin: '0' }}/>

                {/* Option 2: Request */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }} onClick={() => setBridgeSource('request')}>
                  <input 
                    type="radio" 
                    name="bridgeSource"
                    checked={bridgeSource === 'request'} 
                    onChange={() => setBridgeSource('request')} 
                    style={{ marginTop: '0.25rem', accentColor: 'var(--accent)', cursor: 'pointer' }} 
                  />
                  <div style={{ flex: 1 }}>
                    <span style={{ color: bridgeSource === 'request' ? '#fff' : 'var(--text-secondary)', display: 'block', marginBottom: '0.75rem', cursor: 'pointer' }}>Request a bridge from torproject.org</span>
                    <textarea 
                      readOnly
                      value={requestedBridges || (isRequestingBridges ? "Fetching live circumvention bridges from Tor Moat API..." : "Click 'Request a New Bridge' to fetch...")}
                      style={{ width: '100%', minHeight: '60px', background: '#0d1117', border: '1px solid var(--panel-border)', color: bridgeSource === 'request' ? '#fff' : 'var(--text-secondary)', padding: '10px', borderRadius: '4px', resize: 'none', fontSize: '0.8rem', fontFamily: 'monospace', marginBottom: '0.75rem' }}
                    />
                    <button 
                      type="button"
                      disabled={isRequestingBridges}
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          setIsRequestingBridges(true);
                          setBridgeSource('request');
                          const { invoke } = await import('@tauri-apps/api/core');
                          const bridges = await invoke('request_bridges');
                          window.requestedBridges = bridges;
                          setRequestedBridges(bridges);
                          setBridgeString(bridges);
                          localStorage.setItem('hermes_requested_bridges', bridges);
                          localStorage.setItem('hermes_bridge_source', 'request');
                        } catch(e) {
                          console.error("Failed to fetch bridges", e);
                          setRequestedBridges("Error fetching bridges: " + e.toString());
                        } finally {
                          setIsRequestingBridges(false);
                        }
                      }}
                      style={{ background: isRequestingBridges ? 'rgba(255,255,255,0.05)' : 'var(--accent)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: '20px', fontSize: '0.85rem', cursor: isRequestingBridges ? 'not-allowed' : 'pointer', fontWeight: '500' }}>
                      {isRequestingBridges ? "Requesting live bridges..." : "Request a New Bridge..."}
                    </button>
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)', margin: '0' }}/>

                {/* Option 3: Provide */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <input 
                    type="radio" 
                    name="bridgeSource"
                    checked={bridgeSource === 'provide'} 
                    onChange={() => setBridgeSource('provide')} 
                    style={{ marginTop: '0.25rem', accentColor: 'var(--accent)' }} 
                  />
                  <div style={{ flex: 1 }}>
                    <span style={{ color: bridgeSource === 'provide' ? '#fff' : 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Provide a bridge</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.75rem' }}>
                      Enter bridge information from a trusted source.
                    </span>
                    <textarea 
                      value={bridgeSource === 'provide' ? bridgeString : ''} 
                      onChange={e => setBridgeString(e.target.value)} 
                      disabled={bridgeSource !== 'provide'}
                      style={{ width: '100%', minHeight: '70px', background: '#0d1117', border: '1px solid var(--panel-border)', color: '#fff', padding: '10px', borderRadius: '4px', resize: 'vertical', fontSize: '0.8rem', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderTop: '1px solid var(--panel-border)', paddingTop: '1.25rem' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Volunteer Snowflake Proxy</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Help users in censored countries connect to the Tor network by routing their traffic through your node.
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={volunteerProxy} 
                  onChange={e => {
                    const checked = e.target.checked;
                    setVolunteerProxy(checked);
                    import('@tauri-apps/api/core').then(m => m.invoke('set_snowflake_proxy', { enabled: checked })).catch(console.error);
                  }} 
                  style={{ accentColor: 'var(--accent)', width: '18px', height: '18px' }} 
                />
              </label>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
