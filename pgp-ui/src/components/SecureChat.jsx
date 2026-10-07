import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Peer from 'peerjs';
import { Globe, RefreshCw, Send, ShieldCheck, ShieldAlert, Check, Copy, Wifi, WifiOff, Link2, Key, Lock, AlertCircle } from 'lucide-react';
import './SecureChat.css';

// High-availability public STUN servers for robust NAT traversal across different networks
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ],
  sdpSemantics: 'unified-plan'
};

// Normalizes Tor Onion URLs, raw .onion addresses, and custom IDs into clean signaling IDs
export const sanitizePeerId = (input) => {
  if (!input) return '';
  let cleaned = input.trim();
  // Remove protocols
  cleaned = cleaned.replace(/^https?:\/\//i, '');
  // Remove port and path
  cleaned = cleaned.split('/')[0].split(':')[0];
  // Replace dots and special characters with hyphens to create a valid signaling ID
  return cleaned.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
};

export default function SecureChat({ keys, passphrase, showNotification, onionAddress, setOnionAddress }) {
  const [peer, setPeer] = useState(null);
  const [myId, setMyId] = useState('');
  const [friendId, setFriendId] = useState('');
  const [conn, setConn] = useState(null);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Initializing Node...');
  const [copied, setCopied] = useState(false);
  const [isEditingOnion, setIsEditingOnion] = useState(false);
  const [customOnionInput, setCustomOnionInput] = useState(onionAddress || '');

  const peerRef = useRef(null);
  const connRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Setup connection event listeners
  const setupConnection = useCallback((connection) => {
    if (connRef.current) {
      try { connRef.current.close(); } catch (_) {}
    }
    connRef.current = connection;
    setConn(connection);
    setConnectionStatus('Connecting (Handshake)...');

    connection.on('open', () => {
      setConnectionStatus('Connected (E2EE Active)');
      showNotification(`Secure P2P Channel Established with ${connection.peer}!`, 'success');
    });

    connection.on('data', async (data) => {
      try {
        if (!data || typeof data !== 'object') {
          setMessages(prev => [...prev, {
            id: Date.now() + Math.random(),
            text: String(data),
            type: 'received',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            verified: false
          }]);
          return;
        }

        const { text, signatureHex, pubHex } = data;
        let isVerified = false;

        if (signatureHex && pubHex && text) {
          try {
            const msgBytes = Array.from(new TextEncoder().encode(text));
            const sigBytes = Array.from(signatureHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            const pubBytes = Array.from(pubHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            isVerified = await invoke('verify_message', { message: msgBytes, signature: sigBytes, pubKeyBytes: pubBytes });
          } catch (e) {
            console.warn('PGP Signature verification check failed:', e);
            isVerified = false;
          }
        }

        setMessages(prev => [...prev, {
          id: Date.now() + Math.random(),
          text: text || JSON.stringify(data),
          type: 'received',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          verified: isVerified
        }]);

        if (isVerified) {
          showNotification('Received verified PGP-signed message', 'success');
        }
      } catch (e) {
        console.error('Data receive error:', e);
        showNotification('Error receiving message: ' + e.toString(), 'error');
      }
    });

    connection.on('close', () => {
      setConnectionStatus('Node Online (Peer Disconnected)');
      setConn(null);
      connRef.current = null;
      showNotification('Peer disconnected from session', 'error');
    });

    connection.on('error', (err) => {
      console.error('Peer connection error:', err);
      setConnectionStatus('Connection Error');
      showNotification('P2P connection error: ' + (err?.message || String(err)), 'error');
    });
  }, [showNotification]);

  // Initialize or re-initialize PeerJS node
  const initializePeer = useCallback((preferredOnion) => {
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (_) {}
      peerRef.current = null;
    }

    setConnectionStatus('Initializing Node...');

    const preferredId = preferredOnion ? sanitizePeerId(preferredOnion) : undefined;

    try {
      const p = preferredId 
        ? new Peer(preferredId, { config: ICE_CONFIG, debug: 1 })
        : new Peer({ config: ICE_CONFIG, debug: 1 });

      peerRef.current = p;
      setPeer(p);

      p.on('open', (id) => {
        setMyId(id);
        setConnectionStatus('Node Online (Ready)');
      });

      p.on('connection', (connection) => {
        setupConnection(connection);
      });

      p.on('error', (err) => {
        console.error('PeerJS Broker error:', err);
        if (err.type === 'unavailable-id') {
          showNotification('Custom Tor ID registered, falling back to dynamic node ID...', 'error');
          // Fallback to random ID
          initializePeer(null);
        } else if (err.type === 'peer-unavailable') {
          setConnectionStatus('Peer Unavailable');
          showNotification(`Peer "${friendId}" was not found. Verify their Tor Onion link / Node ID and ensure their app is online.`, 'error');
        } else {
          setConnectionStatus('Signaling Error');
          showNotification(`P2P Network error: ${err.type || err}`, 'error');
        }
      });

      p.on('disconnected', () => {
        setConnectionStatus('Disconnected from Signaling');
      });

    } catch (e) {
      console.error('Failed to instantiate PeerJS:', e);
      setConnectionStatus('Initialization Failed');
      showNotification('P2P initialization error: ' + e.toString(), 'error');
    }
  }, [friendId, setupConnection, showNotification]);

  // Initial load
  useEffect(() => {
    initializePeer(onionAddress);
    return () => {
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => scrollToBottom(), [messages]);

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    showNotification('Node Address copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveCustomOnion = () => {
    if (!customOnionInput.trim()) return;
    const formatted = customOnionInput.trim().toLowerCase();
    if (setOnionAddress) {
      setOnionAddress(formatted);
    }
    setIsEditingOnion(false);
    initializePeer(formatted);
    showNotification(`Node address updated to ${formatted}`, 'success');
  };

  const connectToFriend = () => {
    if (!peerRef.current) {
      showNotification('P2P engine not ready. Reconnecting...', 'error');
      initializePeer(onionAddress);
      return;
    }
    const targetPeerId = sanitizePeerId(friendId);
    if (!targetPeerId) {
      showNotification('Please enter a valid Tor Onion Link or Peer Node ID.', 'error');
      return;
    }
    if (targetPeerId === myId) {
      showNotification('Cannot connect to your own Node ID!', 'error');
      return;
    }

    setConnectionStatus(`Connecting to ${targetPeerId}...`);
    try {
      const connection = peerRef.current.connect(targetPeerId, {
        reliable: true
      });
      setupConnection(connection);
    } catch (e) {
      showNotification('Failed to initiate connection: ' + e.toString(), 'error');
    }
  };

  const handleDisconnect = () => {
    if (connRef.current) {
      try { connRef.current.close(); } catch (_) {}
      connRef.current = null;
    }
    setConn(null);
    setConnectionStatus('Node Online (Disconnected)');
    showNotification('Disconnected from peer session.', 'success');
  };

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!draft.trim() || !conn) return;

    const textToSend = draft.trim();

    try {
      let signatureHex = '';
      let pubHex = keys?.pub || '';

      // 1. Sign message with Sequoia PGP engine if private key is present
      if (keys?.priv) {
        const msgBytes = Array.from(new TextEncoder().encode(textToSend));
        const privBytes = Array.from(keys.priv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const sigBytes = await invoke('sign_message', { message: msgBytes, privKeyBytes: privBytes, passphrase });
        signatureHex = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
      }

      // 2. Send over WebRTC Data Channel
      conn.send({
        text: textToSend,
        signatureHex,
        pubHex
      });

      // 3. Update local state
      setMessages(prev => [...prev, {
        id: Date.now() + Math.random(),
        text: textToSend,
        type: 'sent',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        verified: !!keys?.priv
      }]);

      setDraft('');
    } catch (e) {
      showNotification('Failed to sign/send message: ' + e.toString(), 'error');
    }
  };

  const activeDisplayId = (onionAddress && onionAddress.includes('.onion')) ? onionAddress : (myId || 'Generating...');

  return (
    <div className="chat-layout" style={{ minHeight: '560px', display: 'flex', flexDirection: 'column', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--panel-border)' }}>
      
      {/* Top Header: Node ID & Tor Onion Routing Bar */}
      <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          
          {/* Your Tor Onion / P2P Node ID */}
          <div style={{ flex: 1, minWidth: '280px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Globe size={13} color="var(--success)"/> Your Tor Onion Link / Node ID:
              </span>
              <button 
                onClick={() => setIsEditingOnion(!isEditingOnion)} 
                style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: '11px', cursor: 'pointer', padding: 0 }}
              >
                {isEditingOnion ? 'Cancel' : '✏️ Set Custom Onion'}
              </button>
            </div>

            {isEditingOnion ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  value={customOnionInput}
                  onChange={e => setCustomOnionInput(e.target.value)}
                  placeholder="e.g. hermesxyz12345678.onion"
                  style={{ flex: 1, background: '#111', border: '1px solid var(--accent)', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '12px' }}
                />
                <button onClick={handleSaveCustomOnion} style={{ padding: '6px 12px', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                  Apply
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#0d1117', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
                <div style={{ fontFamily: 'monospace', color: 'var(--success)', fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeDisplayId}
                </div>
                <button 
                  onClick={() => copyToClipboard(activeDisplayId)} 
                  title="Copy Node Address"
                  style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                >
                  {copied ? <Check size={13} color="var(--success)"/> : <Copy size={13}/>}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button 
                  onClick={() => initializePeer(onionAddress)} 
                  title="Reconnect P2P Signaling"
                  style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--accent)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                >
                  <RefreshCw size={13}/> Reconnect
                </button>
              </div>
            )}
          </div>

          {/* Connect to Friend's Tor Onion Link */}
          <div style={{ flex: 1, minWidth: '280px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Link2 size={13} color="var(--accent)"/> Connect to Peer via Tor Onion Link or Node ID:
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                value={friendId} 
                onChange={e => setFriendId(e.target.value)} 
                placeholder="http://xyz.onion or hermesxyz...onion" 
                disabled={!!conn}
                style={{ flex: 1, background: '#0d1117', border: '1px solid var(--panel-border)', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '12px' }}
              />
              {conn ? (
                <button 
                  onClick={handleDisconnect} 
                  style={{ padding: '6px 14px', background: 'var(--error)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <WifiOff size={13}/> Disconnect
                </button>
              ) : (
                <button 
                  onClick={connectToFriend} 
                  style={{ padding: '6px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Wifi size={13}/> Connect
                </button>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Main Chat Thread Pane */}
      <div className="thread-pane" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* Header with Connection Pill & PGP Status */}
        <div className="thread-header" style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lock size={15} color={conn ? "var(--success)" : "var(--text-secondary)"}/>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>
              {conn ? `Peer: ${conn.peer}` : 'Direct E2EE Mesh'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ 
              fontSize: '11px', 
              fontFamily: 'monospace', 
              padding: '3px 8px', 
              borderRadius: '4px',
              background: conn ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              color: conn ? 'var(--success)' : 'var(--text-secondary)',
              border: `1px solid ${conn ? 'rgba(16, 185, 129, 0.3)' : 'var(--panel-border)'}`
            }}>
              ● {connectionStatus}
            </span>

            <span style={{ fontSize: '11px', color: keys?.pub ? 'var(--success)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Key size={12}/> {keys?.pub ? 'PGP Signing Active' : 'Unsigned Mode'}
            </span>
          </div>
        </div>

        {/* Message Bubble Feed */}
        <div className="message-area" style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: '260px', maxHeight: '340px' }}>
          {messages.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <Globe size={32} opacity={0.3}/>
              <p>No messages exchanged yet.</p>
              <p style={{ fontSize: '11px', opacity: 0.7 }}>Connect with a peer using their Tor Onion Link or Node ID to initiate an end-to-end encrypted chat.</p>
            </div>
          ) : (
            messages.map(msg => (
              <div 
                key={msg.id} 
                style={{ 
                  alignSelf: msg.type === 'sent' ? 'flex-end' : 'flex-start',
                  maxWidth: '75%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.type === 'sent' ? 'flex-end' : 'flex-start'
                }}
              >
                <div style={{ 
                  background: msg.type === 'sent' ? 'var(--accent)' : 'rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  padding: '10px 14px',
                  borderRadius: msg.type === 'sent' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  fontSize: '14px',
                  wordBreak: 'break-word',
                  border: msg.type === 'sent' ? 'none' : '1px solid var(--panel-border)'
                }}>
                  {msg.text}
                </div>

                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>{msg.time}</span>
                  {msg.verified ? (
                    <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <ShieldCheck size={11}/> PGP Verified
                    </span>
                  ) : (
                    <span style={{ opacity: 0.5 }}>Unsigned</span>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} style={{ display: 'flex', padding: '1rem', gap: '0.75rem', background: 'rgba(0,0,0,0.3)', borderTop: '1px solid var(--panel-border)' }}>
          <input 
            type="text" 
            placeholder={conn ? "Type an encrypted message..." : "Connect to a peer via Tor Onion Link above to start chatting..."}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            disabled={!conn}
            style={{ flex: 1, background: '#0d1117', border: '1px solid var(--panel-border)', color: '#fff', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}
          />
          <button 
            type="submit" 
            disabled={!conn || !draft.trim()} 
            style={{ 
              padding: '0 20px', 
              background: (conn && draft.trim()) ? 'var(--accent)' : 'rgba(255,255,255,0.1)', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '8px', 
              cursor: (conn && draft.trim()) ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Send size={15}/> Send
          </button>
        </form>

      </div>

    </div>
  );
}