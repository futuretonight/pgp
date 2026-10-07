import React from 'react';
import { Settings as SettingsIcon, Shield, Cpu, Lock, Key, Server, Hash } from 'lucide-react';

export default function Settings({ keepAlive, setKeepAlive }) {
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
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            <div className="input-group">
              <label>Default Asymmetric Key Algorithm</label>
              <select style={{ background: '#0d1117', border: '1px solid var(--panel-border)', color: '#fff', padding: '10px', borderRadius: '6px' }} disabled>
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
              <select style={{ background: '#0d1117', border: '1px solid var(--panel-border)', color: '#fff', padding: '10px', borderRadius: '6px' }} disabled>
                <option>AES-256-GCM (Hardware Accelerated)</option>
                <option>XChaCha20-Poly1305</option>
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
                <input type="checkbox" checked disabled style={{ accentColor: 'var(--accent)', width: '18px', height: '18px' }} />
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

      </div>
    </div>
  );
}
