import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings as SettingsIcon, Cpu, Key, Server, Palette, Check, Globe, RefreshCw } from 'lucide-react';
import { THEMES } from '../themes';
import { PREF_KEYS, readPref, writePref, builtinBridgeType } from '../prefs';

const boxStyle = { background: 'var(--inset)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--panel-border)' };
const fieldStyle = { background: 'var(--surface-2)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '10px', borderRadius: '6px' };
const toggleStyle = { accentColor: 'var(--accent)', width: '18px', height: '18px' };

export default function Settings({ keepAlive, setKeepAlive, theme, setTheme, onReconnectTor, torPhase }) {
  const [algo, setAlgo] = useState(() => readPref(PREF_KEYS.algo, 'ecc'));
  const [useBridges, setUseBridges] = useState(() => readPref(PREF_KEYS.useBridges, 'false') === 'true');
  const [bridgeType, setBridgeType] = useState(builtinBridgeType);
  const [bridgeSource, setBridgeSource] = useState(() => readPref(PREF_KEYS.bridgeSource, 'builtin'));
  const [bridgeString, setBridgeString] = useState(() => readPref(PREF_KEYS.bridgeString, ''));
  const [requestedBridges, setRequestedBridges] = useState(() => readPref(PREF_KEYS.requestedBridges, ''));
  const [requestStatus, setRequestStatus] = useState('');
  const [autoFallback, setAutoFallback] = useState(() => readPref(PREF_KEYS.autoFallback, 'true') !== 'false');
  const [dirty, setDirty] = useState(false);
  // Any connection setting change can be applied without restarting.
  const changed = (setter) => (value) => { setter(value); setDirty(true); };

  useEffect(() => {
    writePref(PREF_KEYS.algo, algo);
    writePref(PREF_KEYS.useBridges, useBridges);
    writePref(PREF_KEYS.bridgeType, bridgeType);
    writePref(PREF_KEYS.bridgeSource, bridgeSource);
    writePref(PREF_KEYS.bridgeString, bridgeString);
    writePref(PREF_KEYS.requestedBridges, requestedBridges);
    writePref(PREF_KEYS.autoFallback, autoFallback);
  }, [algo, useBridges, bridgeType, bridgeSource, bridgeString, requestedBridges, autoFallback]);

  const handleRequestBridges = async () => {
    setRequestStatus('Contacting bridges.torproject.org...');
    try {
      // "bridgedb" bridges are handed out a few at a time, so they are less likely to be blocked
      // than the public built-in ones.
      const bridges = await invoke('request_bridges', { transport: null, source: 'bridgedb' });
      setRequestedBridges(bridges);
      setDirty(true);
      setRequestStatus(`Received ${bridges.split('\n').length} bridges.`);
    } catch (e) {
      setRequestStatus('Request failed: ' + e);
    }
  };

  const optionLabel = (active) => ({ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' });

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '18px' }}>
          <SettingsIcon size={20} color="var(--accent)" /> System & Cryptographic Settings
        </h2>
        <p className="subtitle" style={{ marginBottom: '2rem' }}>
          Configure the low-level parameters for the Aura Cryptographic Engine and the Tor Arti client.
        </p>

        {/* Themes */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <Palette size={16} color="var(--accent)"/> Themes
          </h3>
          <div role="radiogroup" aria-label="Theme" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {THEMES.map(t => {
              const selected = t.id === theme;
              return (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(t.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.6rem',
                    textAlign: 'left', padding: '0.85rem', fontWeight: 400,
                    background: selected ? 'var(--accent-wash)' : 'var(--inset)',
                    color: 'var(--text-primary)',
                    border: `1px solid ${selected ? 'var(--accent)' : 'var(--panel-border)'}`,
                    borderRadius: '8px'
                  }}
                >
                  {/* Swatch preview: background, surface, accent, text */}
                  <span style={{ display: 'flex', height: '34px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--line-strong)' }}>
                    {t.swatches.map((c, i) => (
                      <span key={i} style={{ flex: i === 0 ? 2 : 1, background: c }} />
                    ))}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '0.9rem' }}>{t.name}</strong>
                    {selected && <Check size={15} color="var(--accent-ink)" />}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{t.description}</span>
                </button>
              );
            })}
          </div>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.6rem' }}>
            Every look Hermes has shipped so far. Your choice is saved on this device.
          </span>
        </div>

        {/* Security / Memory Settings */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <Cpu size={16} color="var(--success)"/> Memory & App Behavior
          </h3>
          <div style={{ ...boxStyle }}>
            
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
                <input type="checkbox" checked readOnly style={toggleStyle} />
              </label>
            </div>

          </div>
        </div>

        {/* PGP Engine Settings */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <Key size={16} color="var(--accent)"/> OpenPGP Engine Parameters
          </h3>
          <div style={{ background: 'var(--inset)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            <div className="input-group">
              <label>Default Asymmetric Key Algorithm</label>
              <select value={algo} onChange={e => setAlgo(e.target.value)} style={fieldStyle}>
                <option value="ecc">ECC (Ed25519 Signing / Cv25519 Encryption) - Recommended</option>
                <option value="rsa">RSA (4096-bit) - Legacy</option>
                <option value="nist">NIST P-384 - Suite B</option>
              </select>
              <span style={{ fontSize: '0.75rem', color: algo === 'ecc' ? 'var(--text-secondary)' : 'var(--error)', marginTop: '0.25rem' }}>
                {algo === 'ecc'
                  ? '* Applies to the next Node Identity you create.'
                  : 'Warning: legacy or non-standard algorithm. Larger keys, and may be incompatible with standard nodes. Applies to the next Node Identity you create.'}
              </span>
            </div>

            <div className="input-group">
              <label>Symmetric Cipher</label>
              <input type="text" value="AES-256 (OpenPGP, chosen by Sequoia)" disabled style={{ ...fieldStyle, opacity: 0.7 }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Messages and files use the OpenPGP standard, so the cipher is negotiated from the recipient's key.
              </span>
            </div>

          </div>
        </div>

        {/* Network Settings */}
        <div>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <Server size={16} color="var(--accent)"/> Arti Tor Mesh Network
          </h3>
          <div style={{ ...boxStyle }}>
            
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>V3 Onion Services Only</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Always on: the embedded Arti client only supports v3 onion services (56-character addresses).
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'default' }}>
                <input type="checkbox" checked readOnly style={toggleStyle} />
              </label>
            </div>

            <div className="input-group">
              <label>Local Proxy Port</label>
              <input type="text" value="None (Tor runs inside Hermes)" disabled style={{ ...fieldStyle, opacity: 0.7 }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Hermes embeds Tor, so no SOCKS port is opened for other programs to use.
              </span>
            </div>

          </div>
        </div>

        {/* Anti-Censorship (Pluggable Transports) */}
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <Globe size={16} color="var(--accent)"/> Anti-Censorship & Bridges
          </h3>
          <div style={{ ...boxStyle, display: 'flex', flexDirection: 'column' }}>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Use Tor Bridges (obfs4 / Snowflake / webtunnel)</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Bypass campus and national firewalls by disguising Tor traffic as regular HTTPS or WebRTC video calls.
                  Uses the lyrebird transport that ships with Hermes.
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={useBridges} onChange={e => changed(setUseBridges)(e.target.checked)} style={toggleStyle} />
              </label>
            </div>

            {useBridges && (
              <div role="radiogroup" aria-label="Bridge source" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.25rem', paddingLeft: '0.75rem', borderLeft: '2px solid var(--line-strong)' }}>

                {/* Option 1: Built-in */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontSize: 'inherit', fontWeight: 'inherit' }}>
                  <input type="radio" name="bridgeSource" checked={bridgeSource === 'builtin'} onChange={() => changed(setBridgeSource)('builtin')} style={{ accentColor: 'var(--accent)' }} />
                  <span style={{ flex: 1, ...optionLabel(bridgeSource === 'builtin') }}>Select a built-in bridge</span>
                  <select value={bridgeType} onChange={e => changed(setBridgeType)(e.target.value)} disabled={bridgeSource !== 'builtin'} style={{ ...fieldStyle, padding: '6px 10px', width: '200px' }}>
                    <option value="snowflake">Snowflake (best when Tor is blocked)</option>
                    <option value="obfs4">obfs4</option>
                  </select>
                </label>

                {/* Option 2: Request */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <input type="radio" name="bridgeSource" aria-label="Request a bridge from torproject.org" checked={bridgeSource === 'request'} onChange={() => changed(setBridgeSource)('request')} style={{ marginTop: '0.25rem', accentColor: 'var(--accent)' }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ display: 'block', marginBottom: '0.6rem', ...optionLabel(bridgeSource === 'request') }}>Request a bridge from torproject.org</span>
                    <textarea
                      readOnly
                      value={requestedBridges || "Click 'Request a New Bridge' to fetch..."}
                      disabled={bridgeSource !== 'request'}
                      style={{ ...fieldStyle, width: '100%', minHeight: '60px', color: 'var(--text-secondary)', resize: 'none', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', marginBottom: '0.6rem' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <button
                        disabled={bridgeSource !== 'request'}
                        onClick={handleRequestBridges}
                        style={{ background: 'transparent', border: '1px solid var(--line-strong)', color: 'var(--text-primary)', padding: '6px 14px', borderRadius: '20px', fontSize: '0.85rem' }}>
                        Request a New Bridge...
                      </button>
                      {requestStatus && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{requestStatus}</span>}
                    </div>
                  </div>
                </div>

                {/* Option 3: Provide */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <input type="radio" name="bridgeSource" aria-label="Provide a bridge" checked={bridgeSource === 'provide'} onChange={() => changed(setBridgeSource)('provide')} style={{ marginTop: '0.25rem', accentColor: 'var(--accent)' }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ display: 'block', marginBottom: '0.25rem', ...optionLabel(bridgeSource === 'provide') }}>Provide a bridge</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.6rem' }}>
                      Enter bridge lines from a trusted source, one per line.
                    </span>
                    <textarea
                      value={bridgeString}
                      onChange={e => changed(setBridgeString)(e.target.value)}
                      disabled={bridgeSource !== 'provide'}
                      placeholder="obfs4 1.2.3.4:443 FINGERPRINT cert=... iat-mode=0"
                      style={{ ...fieldStyle, width: '100%', minHeight: '70px', resize: 'vertical', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                </div>

              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', borderTop: '1px solid var(--panel-border)', paddingTop: '1.25rem' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Switch to Snowflake automatically if Tor is blocked</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  When bridges are off and a direct connection makes no progress for 45 seconds (common on campus
                  and workplace networks), Hermes retries through the built-in Snowflake bridges.
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={autoFallback} onChange={e => changed(setAutoFallback)(e.target.checked)} style={toggleStyle} />
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button
                onClick={() => { setDirty(false); onReconnectTor(); }}
                disabled={torPhase === 'starting'}
                style={{ padding: '8px 16px', fontSize: '0.85rem', opacity: torPhase === 'starting' ? 0.6 : 1 }}>
                <RefreshCw size={14}/> {torPhase === 'starting' ? 'Connecting...' : 'Apply & Reconnect'}
              </button>
              <span style={{ fontSize: '0.75rem', color: dirty ? 'var(--warn)' : 'var(--text-secondary)' }}>
                {dirty ? 'Connection settings changed. Apply them to reconnect now.' : 'Changes apply to new Tor circuits; existing ones are kept.'}
              </span>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
