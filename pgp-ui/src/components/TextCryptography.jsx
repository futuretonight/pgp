import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Shield, Lock, Unlock, FileSignature, CheckCircle, AlertCircle } from 'lucide-react';
import { toHex, fromHex, textBytes } from '../hex';

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
      
      const sig = await invoke('sign_message', { message: textBytes(plaintext), privKeyBytes: fromHex(keys.priv), passphrase });
      setSignature(toHex(sig));
      setVerifyResult(null);
      showNotification('Message signed successfully', 'success');
      addLog('SUCCESS', 'CRYPTO', 'Detached OpenPGP signature generated', `Length: ${plaintext.length} characters`);
    } catch(e) { 
      showNotification(e.toString(), 'error'); 
      addLog('ERROR', 'CRYPTO', 'Failed to sign message', e.toString());
    }
  };

  const handleVerify = async () => {
    try {
      // Blank signer key = check against our own key (e.g. a message we just signed).
      const signerKey = targetPubKey.trim() || keys?.pub;
      if (!plaintext || !signature.trim() || !signerKey) {
        throw new Error("Please provide Plaintext, Signature (Hex), and the Signer's Public Key (Hex).");
      }

      const isValid = await invoke('verify_message', {
        message: textBytes(plaintext),
        signature: fromHex(signature, 'Signature'),
        pubKeyBytes: fromHex(signerKey, "Signer's public key"),
      });
      
      setVerifyResult(isValid);
      if (isValid) {
        showNotification('Signature is VALID', 'success');
        addLog('SUCCESS', 'CRYPTO', 'Cryptographic signature mathematically verified', '');
      } else {
        showNotification('Signature is INVALID or forged', 'error');
        addLog('WARN', 'CRYPTO', 'Invalid or forged signature detected', '');
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
      const pubHex = targetPubKey.trim() || keys?.pub;
      if (!pubHex) throw new Error("Please provide a Target Public Key (or generate an identity to self-encrypt).");

      const pubBytes = fromHex(pubHex, 'Target public key');
      const enc = await invoke('encrypt_message', { message: textBytes(plaintext), pubKeyBytes: pubBytes });
      setCiphertext(toHex(enc));
      showNotification('Message encrypted successfully', 'success');
      addLog('SUCCESS', 'CRYPTO', 'Message encrypted to the recipient key', `Recipient key: ${pubBytes.length} bytes`);
    } catch(e) {
      showNotification(e.toString(), 'error');
      addLog('ERROR', 'CRYPTO', 'Failed to encrypt message', e.toString());
    }
  };

  const handleDecrypt = async () => {
    try {
      if (!keys?.priv) throw new Error("No private key active. Please load your identity.");
      if (!ciphertext.trim()) throw new Error("Please enter ciphertext (Hex) to decrypt.");

      const dec = await invoke('decrypt_message', { ciphertext: fromHex(ciphertext, 'Ciphertext'), privKeyBytes: fromHex(keys.priv), passphrase });
      const decStr = new TextDecoder().decode(new Uint8Array(dec));
      
      setPlaintext(decStr);
      showNotification('Message decrypted successfully', 'success');
      addLog('SUCCESS', 'CRYPTO', 'Message successfully decrypted', '');
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        {/* Left Column: Plaintext & Sign/Verify */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="input-group">
            <label>Plaintext Message</label>
            <textarea 
              value={plaintext} 
              onChange={e => { setPlaintext(e.target.value); setVerifyResult(null); }} 
              placeholder="Enter text to encrypt or sign..."
              style={{ minHeight: '100px', background: 'var(--surface-2)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '10px', borderRadius: '6px', resize: 'vertical' }}
            />
          </div>
          
          <div className="input-group">
            <label>Cryptographic Signature (Hex)</label>
            <textarea 
              value={signature} 
              onChange={e => { setSignature(e.target.value); setVerifyResult(null); }} 
              placeholder="Detached Ed25519 Signature..."
              style={{ minHeight: '80px', background: 'var(--surface-2)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '10px', borderRadius: '6px', resize: 'vertical', fontSize: '0.8rem', fontFamily: 'monospace' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleSign} className="btn secondary" style={{ flex: 1 }}>
              <FileSignature size={16}/> Sign
            </button>
            <button onClick={handleVerify} className="btn secondary" style={{ flex: 1, background: 'var(--success-wash)', color: 'var(--success)', border: '1px solid var(--success-line)' }}>
              <CheckCircle size={16}/> Verify
            </button>
          </div>

          {verifyResult !== null && (
            <div style={{ 
              padding: '0.75rem', 
              borderRadius: '6px', 
              background: verifyResult ? 'var(--success-wash)' : 'var(--error-wash)',
              color: verifyResult ? 'var(--success)' : 'var(--error)',
              border: `1px solid ${verifyResult ? 'var(--success-line)' : 'var(--error-line)'}`,
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
              placeholder={keys?.pub ? "Leave blank to use your own key" : "Enter public key to encrypt/verify against..."}
              style={{ background: 'var(--surface-2)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '10px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
          </div>

          <div className="input-group">
            <label>Ciphertext (Hex)</label>
            <textarea 
              value={ciphertext} 
              onChange={e => setCiphertext(e.target.value)} 
              placeholder="Encrypted data block..."
              style={{ minHeight: '145px', background: 'var(--surface-2)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '10px', borderRadius: '6px', resize: 'vertical', fontSize: '0.8rem', fontFamily: 'monospace' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleEncrypt} className="btn secondary" style={{ flex: 1, background: 'var(--accent-wash)', color: 'var(--accent-ink)', border: '1px solid var(--accent-line)' }}>
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
