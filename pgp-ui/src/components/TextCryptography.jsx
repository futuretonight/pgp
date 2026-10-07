import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Shield, Lock, Unlock, FileSignature, CheckCircle, AlertCircle } from 'lucide-react';

export default function TextCryptography({ keys, passphrase, showNotification, addLog }) {
  const [plaintext, setPlaintext] = useState('');
  const [ciphertext, setCiphertext] = useState('');
  const [signature, setSignature] = useState('');
  const [targetPubKey, setTargetPubKey] = useState('');
  
  const [verifyResult, setVerifyResult] = useState(null);

  const handleSign = async () => {
    try {
      if (!keys?.priv) throw new Error("No private key active. Please generate or load an identity.");
      if (!plaintext) throw new Error("Please enter some text to sign.");
      
      const privBytes = Array.from(keys.priv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const msgBytes = Array.from(new TextEncoder().encode(plaintext));
      
      const sig = await invoke('sign_message', { message: msgBytes, privKeyBytes: privBytes, passphrase });
      const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
      
      setSignature(sigHex);
      showNotification('Message signed successfully', 'success');
      addLog('SUCCESS', 'CRYPTO', 'Detached Ed25519 signature generated', `Length: ${plaintext.length} bytes`);
    } catch(e) { 
      showNotification(e.toString(), 'error'); 
      addLog('ERROR', 'CRYPTO', 'Failed to sign message', e.toString());
    }
  };

  const handleVerify = async () => {
    try {
      if (!plaintext || !signature || !targetPubKey) {
        throw new Error("Please provide Plaintext, Signature (Hex), and the Signer's Public Key (Hex).");
      }
      
      const msgBytes = Array.from(new TextEncoder().encode(plaintext));
      const sigBytes = Array.from(signature.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const pubBytes = Array.from(targetPubKey.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      
      const isValid = await invoke('verify_message', { message: msgBytes, signature: sigBytes, pubKeyBytes: pubBytes });
      
      setVerifyResult(isValid);
      if (isValid) {
        showNotification('Signature is VALID', 'success');
        addLog('SUCCESS', 'CRYPTO', 'Cryptographic signature mathematically verified', '');
      } else {
        showNotification('Signature is INVALID or forged', 'error');
        addLog('SECURITY', 'CRYPTO', 'Invalid or forged signature detected', '');
      }
    } catch(e) { 
      setVerifyResult(false);
      showNotification(e.toString(), 'error'); 
      addLog('ERROR', 'CRYPTO', 'Failed to verify signature', e.toString());
    }
  };

  const handleEncrypt = async () => {
    try {
      if (!plaintext) throw new Error("Please enter some text to encrypt.");
      const pubHex = targetPubKey || keys?.pub;
      if (!pubHex) throw new Error("Please provide a Target Public Key (or generate an identity to self-encrypt).");
      
      const msgBytes = Array.from(new TextEncoder().encode(plaintext));
      const pubBytes = Array.from(pubHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      
      const enc = await invoke('encrypt_message', { message: msgBytes, pubKeyBytes: pubBytes });
      const encHex = Array.from(new Uint8Array(enc)).map(b => b.toString(16).padStart(2, '0')).join('');
      
      setCiphertext(encHex);
      showNotification('Message encrypted successfully', 'success');
      addLog('SUCCESS', 'CRYPTO', 'Message encrypted with Cv25519', `Target: ${pubHex.substring(0,16)}...`);
    } catch(e) {
      showNotification(e.toString(), 'error');
      addLog('ERROR', 'CRYPTO', 'Failed to encrypt message', e.toString());
    }
  };

  const handleDecrypt = async () => {
    try {
      if (!keys?.priv) throw new Error("No private key active. Please load your identity.");
      if (!ciphertext) throw new Error("Please enter ciphertext (Hex) to decrypt.");
      
      const privBytes = Array.from(keys.priv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const encBytes = Array.from(ciphertext.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      
      const dec = await invoke('decrypt_message', { ciphertext: encBytes, privKeyBytes: privBytes, passphrase });
      const decStr = new TextDecoder().decode(new Uint8Array(dec));
      
      setPlaintext(decStr);
      showNotification('Message decrypted successfully', 'success');
      addLog('SUCCESS', 'CRYPTO', 'Message successfully decrypted and authenticated', '');
    } catch(e) {
      showNotification(e.toString(), 'error');
      addLog('ERROR', 'CRYPTO', 'Failed to decrypt message', e.toString());
    }
  };

  return (
    <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
      <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Shield size={20} color="var(--accent)"/> Text Cryptography Engine
      </h3>
      <p className="subtitle" style={{marginBottom: '1rem'}}>
        Encrypt, decrypt, sign, and verify raw text payloads mathematically.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Left Column: Plaintext & Sign/Verify */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="input-group">
            <label>Plaintext Message</label>
            <textarea 
              value={plaintext} 
              onChange={e => { setPlaintext(e.target.value); setVerifyResult(null); }} 
              placeholder="Enter text to encrypt or sign..."
              style={{ minHeight: '100px', background: '#0d1117', border: '1px solid var(--panel-border)', color: '#fff', padding: '10px', borderRadius: '6px', resize: 'vertical' }}
            />
          </div>
          
          <div className="input-group">
            <label>Cryptographic Signature (Hex)</label>
            <textarea 
              value={signature} 
              onChange={e => { setSignature(e.target.value); setVerifyResult(null); }} 
              placeholder="Detached Ed25519 Signature..."
              style={{ minHeight: '80px', background: '#0d1117', border: '1px solid var(--panel-border)', color: '#fff', padding: '10px', borderRadius: '6px', resize: 'vertical', fontSize: '0.8rem', fontFamily: 'monospace' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleSign} className="btn secondary" style={{ flex: 1 }}>
              <FileSignature size={16}/> Sign
            </button>
            <button onClick={handleVerify} className="btn secondary" style={{ flex: 1, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
              <CheckCircle size={16}/> Verify
            </button>
          </div>

          {verifyResult !== null && (
            <div style={{ 
              padding: '0.75rem', 
              borderRadius: '6px', 
              background: verifyResult ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: verifyResult ? 'var(--success)' : 'var(--error)',
              border: `1px solid ${verifyResult ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem'
            }}>
              {verifyResult ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}
              {verifyResult ? 'Signature Verified: The message is authentic and unaltered.' : 'Signature Invalid: The message is forged or altered.'}
            </div>
          )}
        </div>

        {/* Right Column: Ciphertext & Encrypt/Decrypt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="input-group">
            <label>Target / Signer Public Key (Hex)</label>
            <input 
              type="text" 
              value={targetPubKey} 
              onChange={e => setTargetPubKey(e.target.value)} 
              placeholder={keys?.pub ? "Leave blank to self-encrypt" : "Enter public key to encrypt/verify against..."}
              style={{ background: '#0d1117', border: '1px solid var(--panel-border)', color: '#fff', padding: '10px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
          </div>

          <div className="input-group">
            <label>Ciphertext (Hex)</label>
            <textarea 
              value={ciphertext} 
              onChange={e => setCiphertext(e.target.value)} 
              placeholder="Encrypted data block..."
              style={{ minHeight: '145px', background: '#0d1117', border: '1px solid var(--panel-border)', color: '#fff', padding: '10px', borderRadius: '6px', resize: 'vertical', fontSize: '0.8rem', fontFamily: 'monospace' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleEncrypt} className="btn secondary" style={{ flex: 1, background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent)', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
              <Lock size={16}/> Encrypt
            </button>
            <button onClick={handleDecrypt} className="btn secondary" style={{ flex: 1 }}>
              <Unlock size={16}/> Decrypt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
