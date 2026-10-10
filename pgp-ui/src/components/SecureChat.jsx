import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Globe, RefreshCw, Send, ShieldCheck, Check, Copy, Wifi, WifiOff, Link2, Key, Lock } from 'lucide-react';
import './SecureChat.css';
import { toHex, fromHex, textBytes } from '../hex';

// Images are signed, encrypted and sent inside one Tor message (10 MB limit after encoding).
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const SAFE_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;

export default function SecureChat({ keys, passphrase, showNotification, onionAddress, tor, torPhase, torError, onRetryTor, onCopyPublicKey }) {
  const [friendId, setFriendId] = useState('');
  const [friendPubKey, setFriendPubKey] = useState('');
  const [conn, setConn] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const torOnline = torPhase === 'online';
  const myId = onionAddress || (torPhase === 'error' ? 'Tor is not connected' : 'Connecting to Tor...');
  const connectionStatus = conn
    ? 'Tor Circuit Established (E2EE Active)'
    : connecting
      ? 'Building Tor circuit to peer...'
      : torPhase === 'error'
        ? 'Tor Connection Error'
        : torOnline
          ? `Tor Node Online · onion ${(tor?.onion || 'starting').toLowerCase()}`
          : tor
            ? (tor.blocked ? `Tor stuck at ${tor.percent}%: ${tor.blocked}` : `Connecting to Tor ${tor.percent}%`)
            : 'Starting Tor...';

  const messagesEndRef = useRef(null);
  // The message listener subscribes once and reads the current identity and pinned peer key
  // through refs, so typing in a field never re-subscribes it (which could double-deliver).
  const latest = useRef({});
  latest.current = { keys, passphrase, friendPubKey, showNotification };

  // Listen for incoming messages from Tor Circuit
  useEffect(() => {
    let unlisten;
    let cancelled = false;
    listen('mesh-message-received', async (event) => {
      const { keys, passphrase, friendPubKey, showNotification } = latest.current;
      const rawBytes = event.payload; // encrypted bytes

      // Enforce end-to-end encryption: a message can ONLY be read after it
      // decrypts with our private key. Plaintext is never parsed or shown.
      if (!keys?.priv) {
        showNotification('Encrypted message received, but no identity is loaded to decrypt it.', 'error');
        return;
      }

      let plainBytes;
      try {
        plainBytes = await invoke('decrypt_message', { ciphertext: rawBytes, privKeyBytes: fromHex(keys.priv), passphrase });
      } catch (err) {
        console.error('Dropped undecryptable message:', err);
        showNotification(`Dropped an incoming message: ${err}`, 'error');
        return; // never fall back to plaintext
      }

      let payloadObj;
      try {
        payloadObj = JSON.parse(new TextDecoder().decode(new Uint8Array(plainBytes)));
      } catch {
        payloadObj = null;
      }
      const text = typeof payloadObj?.text === 'string' ? payloadObj.text : null;
      const media = typeof payloadObj?.media === 'string' && SAFE_IMAGE.test(payloadObj.media) ? payloadObj.media : null;
      if (text === null && media === null) {
        showNotification('Dropped a malformed message.', 'error');
        return;
      }

      // Authenticate: the signature must be valid AND from the peer key we
      // pinned (not the key the sender embedded — that is attacker-controlled).
      const pinned = (friendPubKey || '').replace(/\s+/g, '').toLowerCase();
      let isVerified = false;
      if (typeof payloadObj.signatureHex === 'string' && typeof payloadObj.pubHex === 'string') {
        try {
          const sigOk = await invoke('verify_message', {
            message: textBytes(text ?? media),
            signature: fromHex(payloadObj.signatureHex),
            pubKeyBytes: fromHex(payloadObj.pubHex),
          });
          const fromPinnedPeer = !!pinned && payloadObj.pubHex.toLowerCase() === pinned;
          isVerified = sigOk && fromPinnedPeer;
          if (sigOk && pinned && !fromPinnedPeer) {
            showNotification('Signature is valid but NOT from your pinned peer key — possible impersonation.', 'error');
          }
        } catch { isVerified = false; }
      }

      setMessages(prev => [...prev, {
        id: Date.now() + Math.random(),
        text,
        media,
        type: 'received',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        verified: isVerified
      }]);
      showNotification(isVerified ? 'Received a verified, encrypted message.' : 'Received an encrypted message (sender unverified).', isVerified ? 'success' : 'error');
    }).then(fn => { if (cancelled) fn(); else unlisten = fn; });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => scrollToBottom(), [messages]);

  const copyToClipboard = async (text) => {
    if (!onionAddress) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showNotification('Tor Node Address copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      showNotification('Could not copy: ' + e, 'error');
    }
  };

  const connectToFriend = async () => {
    const target = friendId.trim().toLowerCase();
    if (!target.endsWith('.onion')) {
      showNotification('Please enter a valid Tor .onion address.', 'error');
      return;
    }
    if (target === onionAddress) {
      showNotification("That's your own address. Enter your peer's onion address.", 'error');
      return;
    }
    try {
      if (friendPubKey.trim()) fromHex(friendPubKey, "Peer's public key");
    } catch (e) {
      showNotification(e.message, 'error');
      return;
    }
    setConnecting(true);
    try {
      // Opens a real stream to the peer's onion service to prove it is reachable.
      await invoke('connect_peer', { targetOnion: target });
      setFriendId(target);
      setConn(true);
      showNotification('Secure Tor Channel Established!', 'success');
    } catch (e) {
      setConn(false);
      showNotification(`Failed to connect: ${e}`, 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setConn(false);
    showNotification('Disconnected Tor circuit.', 'success');
  };

  // Sign `content` with our key, encrypt {content, signature, our key} to the peer, send it.
  const sendSigned = async (field, content) => {
    // Enforce end-to-end encryption: we must have our own identity (to sign)
    // and the peer's public key (to encrypt). Hermes never sends plaintext.
    if (!keys?.priv || !keys?.pub) {
      throw new Error('Create or load an identity first — messages must be signed.');
    }
    if (!friendPubKey.trim()) {
      throw new Error("Enter your peer's public key to open an encrypted channel. Hermes never sends plaintext.");
    }
    // 1. Sign the plaintext with our signing subkey.
    const sigBytes = await invoke('sign_message', { message: textBytes(content), privKeyBytes: fromHex(keys.priv), passphrase });
    // 2. Build the signed payload, then ALWAYS encrypt it to the peer's key.
    const payloadStr = JSON.stringify({ [field]: content, signatureHex: toHex(sigBytes), pubHex: keys.pub });
    const payloadBytes = await invoke('encrypt_message', { message: textBytes(payloadStr), pubKeyBytes: fromHex(friendPubKey, "Peer's public key") });
    // 3. Send only the ciphertext over the Tor stream.
    await invoke('send_mesh_message', { targetOnion: friendId, payload: payloadBytes });
  };

  const addSent = (fields) => setMessages(prev => [...prev, {
    id: Date.now() + Math.random(),
    type: 'sent',
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    verified: true,
    ...fields,
  }]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const textToSend = draft.trim();
    if (!textToSend || !conn || sending) return;
    setSending(true);
    try {
      await sendSigned('text', textToSend);
      addSent({ text: textToSend });
      setDraft('');
    } catch (err) {
      showNotification('Failed to send message: ' + (err?.message ?? err), 'error');
    } finally {
      setSending(false);
    }
  };

  const handlePaste = (e) => {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    if (!conn) {
      showNotification('Connect to a peer first to send media.', 'error');
      return;
    }
    const blob = item.getAsFile();
    if (!blob) return;
    if (blob.size > MAX_IMAGE_BYTES) {
      showNotification(`Image is ${(blob.size / 1048576).toFixed(1)} MB; the limit is ${MAX_IMAGE_BYTES / 1048576} MB.`, 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64data = event.target.result;
      if (!SAFE_IMAGE.test(base64data)) {
        showNotification('Only PNG, JPEG, GIF and WebP images can be sent.', 'error');
        return;
      }
      setSending(true);
      try {
        await sendSigned('media', base64data);
        addSent({ media: base64data });
      } catch (err) {
        showNotification('Failed to send image: ' + (err?.message ?? err), 'error');
      } finally {
        setSending(false);
      }
    };
    reader.readAsDataURL(blob);
  };

  return (
    <div className="chat-layout" style={{ minHeight: '560px', display: 'flex', flexDirection: 'column', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--panel-border)' }}>
      
      {/* Top Header: our address, then the peer connect row. Each is full width so a
          56-character v3 onion address always fits (it wraps inside its box). */}
      <div style={{ padding: '1rem 1.25rem', background: 'var(--inset-strong)', borderBottom: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Your Tor Onion */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
          <div style={{ fontSize: '11px', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Globe size={13}/> Your Local Tor Node Service:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'var(--surface-2)', padding: '8px 8px 8px 12px', borderRadius: '6px', border: '1px solid var(--panel-border)', minWidth: 0 }}>
            <div title={myId} style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.5, wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
              {myId}
            </div>
            <button onClick={() => copyToClipboard(onionAddress)} disabled={!onionAddress} title="Copy onion address" style={{ flex: 'none', background: 'var(--tint-strong)', border: 'none', color: 'var(--text-primary)', padding: '5px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 500 }}>
              {copied ? <Check size={13} color="var(--success)"/> : <Copy size={13}/>}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={onCopyPublicKey} disabled={!keys?.pub} title={keys?.pub ? 'Copy your public key for your peer' : 'Create or load an identity first'} style={{ flex: 'none', background: 'var(--tint-strong)', border: 'none', color: 'var(--text-primary)', padding: '5px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 500 }}>
              <Key size={13}/> Copy Public Key
            </button>
          </div>
        </div>

        {/* Connect to Friend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Link2 size={13} color="var(--accent)"/> Connect to Peer via Tor Onion Link:
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              value={friendId}
              onChange={e => setFriendId(e.target.value.trim())}
              placeholder="Peer's address (…xyz.onion)"
              disabled={conn || connecting}
              spellCheck={false}
              style={{ flex: '2 1 280px', minWidth: 0, background: 'var(--surface-2)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '8px 10px', borderRadius: '6px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
            />
            <input
              value={friendPubKey}
              onChange={e => setFriendPubKey(e.target.value)}
              placeholder="Peer's PGP public key (hex)"
              disabled={conn || connecting}
              spellCheck={false}
              style={{ flex: '1 1 200px', minWidth: 0, background: 'var(--surface-2)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '8px 10px', borderRadius: '6px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
            />
            {conn ? (
              <button onClick={handleDisconnect} style={{ flex: 'none', padding: '8px 16px', background: 'var(--error)', color: 'var(--on-accent)', border: 'none', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <WifiOff size={13}/> Disconnect
              </button>
            ) : (
              <button onClick={connectToFriend} disabled={!torOnline || connecting} title={torOnline ? 'Open a Tor circuit to the peer' : 'Wait until Tor is online'} style={{ flex: 'none', padding: '8px 16px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', opacity: (!torOnline || connecting) ? 0.6 : 1 }}>
                <Wifi size={13}/> {connecting ? 'Connecting...' : 'Connect'}
              </button>
            )}
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', padding: '3px 8px', borderRadius: '4px', background: conn ? 'var(--success-wash)' : (connectionStatus.includes('Error') ? 'var(--error-wash)' : 'var(--tint)'), color: conn ? 'var(--success)' : (connectionStatus.includes('Error') ? 'var(--error)' : 'var(--text-secondary)'), border: `1px solid ${conn ? 'var(--success-line)' : (connectionStatus.includes('Error') ? 'var(--error-line)' : 'var(--panel-border)')}`}}>
              ● {connectionStatus}
            </span>
            {connectionStatus.includes('Error') && (
              <button 
                onClick={onRetryTor}
                style={{ background: 'var(--tint)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                title={torError || 'Retry Tor connection'}
              >
                <RefreshCw size={11} /> Retry
              </button>
            )}
            <span style={{ fontSize: '11px', color: keys?.pub ? 'var(--success)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Key size={12}/> {keys?.pub ? 'PGP Signing Active' : 'Unsigned Mode'}
            </span>
          </div>
        </div>

        <div className="message-area" style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: '260px', maxHeight: '340px' }}>
          {messages.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <Globe size={32} opacity={0.3}/>
              <p>{torOnline ? 'Your onion service is running.' : 'Waiting for the Tor connection...'}</p>
              <p style={{ fontSize: '11px', opacity: 0.7 }}>Swap onion addresses and public keys with your peer, then Connect.</p>
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
            disabled={!conn || sending}
            style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}
          />
          <button type="submit" disabled={!conn || sending || !draft.trim()} style={{ padding: '0 20px', background: (conn && draft.trim()) ? 'var(--accent)' : 'var(--tint-strong)', color: (conn && draft.trim()) ? 'var(--on-accent)' : 'var(--text-secondary)', border: 'none', borderRadius: '8px', cursor: (conn && draft.trim()) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {sending ? "Sending..." : <><Send size={15}/> Send</>}
          </button>
        </form>

      </div>
    </div>
  );
}