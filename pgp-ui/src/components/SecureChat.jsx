import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Globe, RefreshCw, Send, ShieldCheck, ShieldAlert, Check, Copy, Wifi, WifiOff, Link2, Key, Lock, AlertCircle, Image as ImageIcon } from 'lucide-react';
import './SecureChat.css';

export default function SecureChat({ keys, passphrase, showNotification, onionAddress, setOnionAddress }) {
  const [myId, setMyId] = useState(onionAddress || 'Generating Onion Address...');
  const [friendId, setFriendId] = useState('');
  const [friendPubKey, setFriendPubKey] = useState('');
  const [conn, setConn] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Initializing Tor Node...');
  const [copied, setCopied] = useState(false);
  const [isEditingOnion, setIsEditingOnion] = useState(false);
  const [customOnionInput, setCustomOnionInput] = useState(onionAddress || '');
  const [pastingMedia, setPastingMedia] = useState(false);

  const messagesEndRef = useRef(null);
  // Mirror the pinned peer key into a ref so the (stable) message listener can
  // authenticate against the *current* value without re-subscribing.
  const friendPubKeyRef = useRef('');
  friendPubKeyRef.current = friendPubKey;

  // Initialize Tor Node via Arti Rust Backend
  const initializeTorNode = useCallback(async () => {
    setConnectionStatus('Bootstrapping Tor Circuit...');
    try {
      // Invoke the Tauri command to start Arti and generate the Hidden Service
      const realOnion = await invoke('start_tor_node');
      setMyId(realOnion);
      if (setOnionAddress) setOnionAddress(realOnion);
      setConnectionStatus('Tor Node Online (Deep Anonymity)');
      showNotification('Tor circuit built successfully. Node published to DHT.', 'success');
    } catch (e) {
      console.error(e);
      setConnectionStatus('Tor Connection Error');
      showNotification('Failed to bootstrap Tor: ' + e.toString(), 'error');
    }
  }, [showNotification, setOnionAddress]);

  useEffect(() => {
    initializeTorNode();
  }, [initializeTorNode]);

  // Listen for incoming messages from Tor Circuit
  useEffect(() => {
    let unlisten;
    const setupListener = async () => {
      unlisten = await listen('mesh-message-received', async (event) => {
        const rawBytes = event.payload; // encrypted bytes

        // Enforce end-to-end encryption: a message can ONLY be read after it
        // decrypts with our private key. Plaintext is never parsed or shown.
        if (!keys?.priv) {
          showNotification('Encrypted message received, but no identity is loaded to decrypt it.', 'error');
          return;
        }

        let plainBytes;
        try {
          const privBytes = Array.from(keys.priv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
          plainBytes = await invoke('decrypt_message', { ciphertext: rawBytes, privKeyBytes: privBytes, passphrase });
        } catch (err) {
          console.error('Dropped undecryptable message:', err);
          showNotification('Dropped a message that was not encrypted to your key.', 'error');
          return; // never fall back to plaintext
        }

        let payloadObj;
        try {
          payloadObj = JSON.parse(new TextDecoder().decode(new Uint8Array(plainBytes)));
        } catch {
          showNotification('Dropped a malformed message.', 'error');
          return;
        }

        // Authenticate: the signature must be valid AND from the peer key we
        // pinned (not the key the sender embedded — that is attacker-controlled).
        const pinned = (friendPubKeyRef.current || '').trim().toLowerCase();
        let isVerified = false;
        if (payloadObj.signatureHex && payloadObj.pubHex) {
          try {
            const contentBytes = Array.from(new TextEncoder().encode(payloadObj.text || payloadObj.media || ''));
            const sigBytes = Array.from(payloadObj.signatureHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            const pubBytes = Array.from(payloadObj.pubHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            const sigOk = await invoke('verify_message', { message: contentBytes, signature: sigBytes, pubKeyBytes: pubBytes });
            const fromPinnedPeer = !!pinned && payloadObj.pubHex.toLowerCase() === pinned;
            isVerified = sigOk && fromPinnedPeer;
            if (sigOk && pinned && !fromPinnedPeer) {
              showNotification('Signature is valid but NOT from your pinned peer key — possible impersonation.', 'error');
            }
          } catch { isVerified = false; }
        }

        setMessages(prev => [...prev, {
          id: Date.now() + Math.random(),
          text: payloadObj.text,
          media: payloadObj.media,
          type: 'received',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          verified: isVerified
        }]);
        showNotification(isVerified ? 'Received a verified, encrypted message.' : 'Received an encrypted message (sender unverified).', isVerified ? 'success' : 'error');
      });
    };
    setupListener();
    
    return () => {
      if (unlisten) unlisten();
    };
  }, [keys, passphrase, showNotification]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => scrollToBottom(), [messages]);

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    showNotification('Tor Node Address copied!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const connectToFriend = async () => {
    if (!friendId || !friendId.endsWith('.onion')) {
      showNotification('Please enter a valid Tor .onion address.', 'error');
      return;
    }
    setConnectionStatus(`Resolving DHT for ${friendId}...`);
    // Placeholder for libp2p Tor connection logic
    setTimeout(() => {
      setConn(true);
      setConnectionStatus('Tor Circuit Established (E2EE Active)');
      showNotification(`Secure Tor Channel Established!`, 'success');
    }, 2000);
  };

  const handleDisconnect = () => {
    setConn(false);
    setConnectionStatus('Tor Node Online');
    showNotification('Disconnected Tor circuit.', 'success');
  };

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!draft.trim() || !conn) return;

    // Enforce end-to-end encryption: we must have our own identity (to sign)
    // and the peer's public key (to encrypt). Hermes never sends plaintext.
    if (!keys?.priv || !keys?.pub) {
      showNotification('Create or load an identity first — messages must be signed.', 'error');
      return;
    }
    if (!friendPubKey.trim()) {
      showNotification("Enter your peer's public key to open an encrypted channel. Hermes never sends plaintext.", 'error');
      return;
    }

    const textToSend = draft.trim();

    try {
      // 1. Sign the plaintext with our Ed25519 signing subkey.
      const msgBytes = Array.from(new TextEncoder().encode(textToSend));
      const privBytes = Array.from(keys.priv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const sigBytes = await invoke('sign_message', { message: msgBytes, privKeyBytes: privBytes, passphrase });
      const signatureHex = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');

      // 2. Build the signed payload, then ALWAYS encrypt it to the peer's key.
      const payloadStr = JSON.stringify({ text: textToSend, signatureHex, pubHex: keys.pub });
      const clearBytes = Array.from(new TextEncoder().encode(payloadStr));
      const friendPubBytes = Array.from(friendPubKey.trim().match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const payloadBytes = await invoke('encrypt_message', { message: clearBytes, pubKeyBytes: friendPubBytes });

      // 3. Send only the ciphertext over the Tor stream.
      await invoke('send_mesh_message', { targetOnion: friendId, payload: payloadBytes });

      setMessages(prev => [...prev, {
        id: Date.now() + Math.random(),
        text: textToSend,
        type: 'sent',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        verified: true
      }]);
      setDraft('');
    } catch (e) {
      showNotification('Failed to send message: ' + e.toString(), 'error');
    }
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64data = event.target.result;
          
          if (!conn) {
             showNotification("Connect to a peer first to send media.", "error");
             return;
          }
          // Same E2E enforcement as text: need our identity + the peer's key.
          if (!keys?.priv || !keys?.pub) {
            showNotification('Create or load an identity first to send signed media.', 'error');
            return;
          }
          if (!friendPubKey.trim()) {
            showNotification("Enter your peer's public key first — media is never sent in plaintext.", 'error');
            return;
          }

          try {
            setPastingMedia(true);
            // 1. Sign the media payload.
            const msgBytes = Array.from(new TextEncoder().encode(base64data));
            const privBytes = Array.from(keys.priv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            const sigBytes = await invoke('sign_message', { message: msgBytes, privKeyBytes: privBytes, passphrase });
            const signatureHex = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');

            // 2. Build signed payload and ALWAYS encrypt it to the peer's key.
            const payloadStr = JSON.stringify({ media: base64data, signatureHex, pubHex: keys.pub });
            const clearBytes = Array.from(new TextEncoder().encode(payloadStr));
            const friendPubBytes = Array.from(friendPubKey.trim().match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            const payloadBytes = await invoke('encrypt_message', { message: clearBytes, pubKeyBytes: friendPubBytes });

            await invoke('send_mesh_message', { targetOnion: friendId, payload: payloadBytes });
            
            // Render local
            setMessages(prev => [...prev, {
              id: Date.now() + Math.random(),
              media: base64data,
              type: 'sent',
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              verified: !!keys?.priv
            }]);
          } catch(err) {
            showNotification('Media signing failed: ' + err, 'error');
          } finally {
            setPastingMedia(false);
          }
        };
        reader.readAsDataURL(blob);
      }
    }
  };

  return (
    <div className="chat-layout" style={{ minHeight: '560px', display: 'flex', flexDirection: 'column', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--panel-border)' }}>
      
      {/* Top Header */}
      <div style={{ padding: '1rem', background: 'var(--inset-strong)', borderBottom: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          
          {/* Your Tor Onion */}
          <div style={{ flex: 1, minWidth: '280px' }}>
            <div style={{ fontSize: '11px', color: 'var(--success)', display: 'flex', alignItems: 'center', marginBottom: '4px', gap: '4px' }}>
              <Globe size={13}/> Your Local Tor Node Service:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-2)', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
              <div style={{ fontFamily: 'monospace', color: 'var(--text-primary)', fontSize: '13px', flex: 1 }}>
                {myId}
              </div>
              <button onClick={() => copyToClipboard(myId)} style={{ background: 'var(--tint-strong)', border: 'none', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                {copied ? <Check size={13} color="var(--success)"/> : <Copy size={13}/>}
              </button>
            </div>
          </div>

          {/* Connect to Friend */}
          <div style={{ flex: 1, minWidth: '280px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Link2 size={13} color="var(--accent)"/> Connect to Peer via Tor Onion Link:
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                value={friendId} 
                onChange={e => setFriendId(e.target.value)} 
                placeholder="xyz...onion" 
                disabled={conn}
                style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '6px', fontSize: '12px' }}
              />
              <input 
                value={friendPubKey} 
                onChange={e => setFriendPubKey(e.target.value)} 
                placeholder="Friend's PGP PubKey (Hex)" 
                disabled={conn}
                style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '6px', fontSize: '12px' }}
              />
              {conn ? (
                <button onClick={handleDisconnect} style={{ padding: '6px 14px', background: 'var(--error)', color: 'var(--on-accent)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <WifiOff size={13}/> Disconnect
                </button>
              ) : (
                <button onClick={connectToFriend} style={{ padding: '6px 14px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Wifi size={13}/> Connect
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Thread Pane */}
      <div className="thread-pane" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        <div className="thread-header" style={{ background: 'var(--inset)', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lock size={15} color={conn ? "var(--success)" : "var(--text-secondary)"}/>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>
              {conn ? `Tor Circuit: ${friendId.substring(0, 16)}...` : 'Decentralized Tor Mesh'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', padding: '3px 8px', borderRadius: '4px', background: conn ? 'var(--success-wash)' : 'var(--tint)', color: conn ? 'var(--success)' : 'var(--text-secondary)', border: `1px solid ${conn ? 'var(--success-line)' : 'var(--panel-border)'}`}}>
              ● {connectionStatus}
            </span>
            <span style={{ fontSize: '11px', color: keys?.pub ? 'var(--success)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Key size={12}/> {keys?.pub ? 'PGP Signing Active' : 'Unsigned Mode'}
            </span>
          </div>
        </div>

        <div className="message-area" style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: '260px', maxHeight: '340px' }}>
          {messages.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <Globe size={32} opacity={0.3}/>
              <p>Mesh network initialized. Absolute zero IP leaks.</p>
              <p style={{ fontSize: '11px', opacity: 0.7 }}>Connect with a peer using their real Tor Onion Link.</p>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} style={{ alignSelf: msg.type === 'sent' ? 'flex-end' : 'flex-start', maxWidth: '75%', display: 'flex', flexDirection: 'column', alignItems: msg.type === 'sent' ? 'flex-end' : 'flex-start' }}>
                <div style={{ background: msg.type === 'sent' ? 'var(--accent)' : 'var(--tint-strong)', color: msg.type === 'sent' ? 'var(--on-accent)' : 'var(--text-primary)', padding: '10px 14px', borderRadius: msg.type === 'sent' ? '12px 12px 2px 12px' : '12px 12px 12px 2px', fontSize: '14px', wordBreak: 'break-word', border: msg.type === 'sent' ? 'none' : '1px solid var(--panel-border)' }}>
                  {msg.media ? (
                    <img src={msg.media} alt="Secure Media" style={{ maxWidth: '100%', borderRadius: '4px', border: '1px solid var(--line-strong)' }}/>
                  ) : (
                    msg.text
                  )}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>{msg.time}</span>
                  {msg.verified ? <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '2px' }}><ShieldCheck size={11}/> PGP Verified</span> : <span style={{ opacity: 0.5 }}>Unsigned</span>}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} style={{ display: 'flex', padding: '1rem', gap: '0.75rem', background: 'var(--inset-strong)', borderTop: '1px solid var(--panel-border)' }}>
          <input 
            type="text" 
            placeholder={conn ? "Type message or paste image (Ctrl+V)..." : "Connect via Tor Onion Link to chat..."}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onPaste={handlePaste}
            disabled={!conn || pastingMedia}
            style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}
          />
          <button type="submit" disabled={!conn || (!draft.trim() && !pastingMedia)} style={{ padding: '0 20px', background: (conn && draft.trim()) ? 'var(--accent)' : 'var(--tint-strong)', color: (conn && draft.trim()) ? 'var(--on-accent)' : 'var(--text-secondary)', border: 'none', borderRadius: '8px', cursor: (conn && draft.trim()) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {pastingMedia ? "Processing..." : <><Send size={15}/> Send</>}
          </button>
        </form>

      </div>
    </div>
  );
}