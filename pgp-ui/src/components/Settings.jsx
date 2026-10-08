import React from 'react';
import { Settings as SettingsIcon, Shield, Cpu, Lock, Key, Server, Hash, Palette, Check } from 'lucide-react';
import { THEMES } from '../themes';

export default function Settings({ keepAlive, setKeepAlive, theme, setTheme }) {
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
          <div style={{ background: 'var(--inset)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
            
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
                  Force hardware-level memory scrubbing for private keys when dropped. (Currently hardcoded ACTIVE).
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'not-allowed', opacity: 0.5 }}>
                <input type="checkbox" checked disabled style={{ width: '18px', height: '18px' }} />
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
              <select style={{ background: 'var(--surface-2)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '10px', borderRadius: '6px' }} disabled>
                <option>ECC (Ed25519 Signing / Cv25519 Encryption) - Recommended</option>
                <option>RSA (4096-bit) - Legacy</option>
                <option>NIST P-384 - Suite B</option>
              </select>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                * Changing this requires generating a new Node Identity. Currently locked to Ed25519 for optimal Tor compatibility.
              </span>
            </div>

            <div className="input-group">
              <label>Symmetric File Encryption Cipher</label>
              <select style={{ background: 'var(--surface-2)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '10px', borderRadius: '6px' }} disabled>
                <option>AES-256-GCM (Hardware Accelerated)</option>
                <option>XChaCha20-Poly1305</option>
              </select>
            </div>

          </div>
        </div>

        {/* Network Settings */}
        <div>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <Server size={16} color="var(--accent)"/> Arti Tor Mesh Network
          </h3>
          <div style={{ background: 'var(--inset)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
            
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Force V3 Onion Services Only</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Reject legacy V2 connections. V3 provides better cryptography and longer addresses.
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked disabled style={{ accentColor: 'var(--accent)', width: '18px', height: '18px' }} />
              </label>
            </div>

            <div className="input-group">
              <label>Local Proxy Bind Port</label>
              <input type="text" value="Random (Ephemeral)" disabled style={{ background: 'var(--surface-2)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '10px', borderRadius: '6px', opacity: 0.7 }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                The internal Tor client dynamically assigns ports to prevent fingerprinting.
              </span>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
