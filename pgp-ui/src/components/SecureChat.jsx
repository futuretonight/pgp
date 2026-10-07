import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Peer from 'peerjs';
import './SecureChat.css';

export default function SecureChat({ keys, passphrase, showNotification }) {
  const [peer, setPeer] = useState(null);
  const [myId, setMyId] = useState('');
  const [friendId, setFriendId] = useState('');
  const [conn, setConn] = useState(null);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');

  useEffect(() => {
    // Initialize PeerJS for P2P connection
    const newPeer = new Peer();
    
    newPeer.on('open', (id) => {
      setMyId(id);
    });

    newPeer.on('connection', (connection) => {
      setupConnection(connection);
    });

    setPeer(newPeer);
    
    return () => {
      newPeer.destroy();
    };
  }, []);

  const setupConnection = (connection) => {
    setConn(connection);
    setConnectionStatus('Connected (E2EE)');
    showNotification('P2P Connection Established!', 'success');

    connection.on('data', async (data) => {
      // Data format: { text, signatureHex, pubHex }
      try {
        if (!data.signatureHex || !data.pubHex) throw new Error("Unsigned message received");
        
        // Verify signature using Rust backend
        const msgBytes = Array.from(new TextEncoder().encode(data.text));
        const sigBytes = Array.from(data.signatureHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const pubBytes = Array.from(data.pubHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        
        const isValid = await invoke('verify_message', { message: msgBytes, signature: sigBytes, pubKeyBytes: pubBytes });
        
        if (isValid) {
          setMessages(prev => [...prev, {
            id: Date.now(),
            text: data.text,
            type: 'received',
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            verified: true
          }]);
        } else {
          showNotification('Received message with invalid cryptographic signature!', 'error');
        }
      } catch (e) {
        showNotification('Verification error: ' + e.toString(), 'error');
      }
    });

    connection.on('close', () => {
      setConnectionStatus('Disconnected');
      setConn(null);
    });
  };

  const connectToFriend = () => {
    if (!peer || !friendId) return;
    const connection = peer.connect(friendId);
    setupConnection(connection);
  };

  const messagesEndRef = useRef(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => scrollToBottom(), [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!draft.trim() || !conn) return;

    if (!keys?.priv || !keys?.pub) {
      showNotification('You must create an identity first to sign messages.', 'error');
      return;
    }

    try {
      // 1. Sign message using Rust engine
      const msgBytes = Array.from(new TextEncoder().encode(draft));
      const privBytes = Array.from(keys.priv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      
      const sigBytes = await invoke('sign_message', { message: msgBytes, privKeyBytes: privBytes, passphrase });
      const signatureHex = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
      
      // 2. Send over P2P network
      conn.send({
        text: draft,
        signatureHex: signatureHex,
        pubHex: keys.pub
      });

      // 3. Update local UI
      setMessages(prev => [...prev, {
        id: Date.now(),
        text: draft,
        type: 'sent',
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        verified: true
      }]);
      
      setDraft('');
    } catch (e) {
      showNotification('Failed to sign message: ' + e.toString(), 'error');
    }
  };

  return (
    <div className="chat-layout" style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid #333', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', color: '#888' }}>Your P2P Node ID (Share with friend):</div>
          <div style={{ fontFamily: 'monospace', color: '#10b981', userSelect: 'all', background: '#111', padding: '4px 8px', borderRadius: '4px' }}>
            {myId || 'Generating...'}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', color: '#888' }}>Connect to Friend's Node ID:</div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input 
              value={friendId} 
              onChange={e => setFriendId(e.target.value)} 
              placeholder="Friend's Node ID..." 
              style={{ flex: 1, background: '#111', border: '1px solid #333', color: '#fff', padding: '4px 8px', borderRadius: '4px' }}
            />
            <button onClick={connectToFriend} style={{ padding: '4px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Connect</button>
          </div>
        </div>
      </div>

      <div className="thread-pane" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="thread-header">
          <span>{conn ? `Connected to ${conn.peer}` : 'P2P Terminal'}</span>
          <span style={{fontSize: 12, color: conn ? '#10b981' : '#888', fontFamily:'monospace'}}>{connectionStatus}</span>
        </div>

        <div className="message-area" style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {messages.map(msg => (
            <div key={msg.id} className={`msg ${msg.type}`} style={{ marginBottom: '1rem', textAlign: msg.type === 'sent' ? 'right' : 'left' }}>
              <div style={{ 
                display: 'inline-block', 
                background: msg.type === 'sent' ? '#3b82f6' : '#222', 
                padding: '8px 12px', 
                borderRadius: '8px' 
              }}>
                {msg.text}
              </div>
              <div className="msg-meta" style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                {msg.time} {msg.verified ? '✓ PGP Verified' : ''}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form className="input-area" onSubmit={handleSend} style={{ display: 'flex', padding: '1rem', gap: '1rem', background: 'rgba(0,0,0,0.2)' }}>
          <input 
            type="text" 
            className="msg-input" 
            placeholder={conn ? "Type a secure message..." : "Connect to a peer first..."} 
            value={draft}
            onChange={e => setDraft(e.target.value)}
            disabled={!conn}
            style={{ flex: 1, background: '#111', border: '1px solid #333', color: '#fff', padding: '10px', borderRadius: '4px' }}
          />
          <button type="submit" disabled={!conn} style={{ padding: '0 20px', background: conn ? '#3b82f6' : '#444', color: '#fff', border: 'none', borderRadius: '4px', cursor: conn ? 'pointer' : 'not-allowed' }}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}