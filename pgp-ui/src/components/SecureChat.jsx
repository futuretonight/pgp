import React, { useState, useRef, useEffect } from 'react';
import './SecureChat.css';

export default function SecureChat() {
  const [activeContact, setActiveContact] = useState(null);
  const [draft, setDraft] = useState('');
  
  // Fake persistent state for UI dev (Replace with props/store later)
  const contacts = [
    { id: 1, name: 'Ghost_Protocol', status: 'online' },
    { id: 2, name: 'Alice_Vault', status: 'offline' },
    { id: 3, name: 'Burner_07', status: 'idle' },
  ];

  const [messages, setMessages] = useState({
    1: [
      { id: 101, text: "Handshake initialized.", type: 'sent', time: '10:00' },
      { id: 102, text: "Ack. Key exchange complete.", type: 'received', time: '10:01' },
      { id: 103, text: "Begin transmission.", type: 'sent', time: '10:02' },
    ]
  });

  // Auto-scroll logic
  const messagesEndRef = useRef(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => scrollToBottom(), [messages, activeContact]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!draft.trim() || !activeContact) return;

    // Simulate sending (Optimistic UI)
    const newMsg = {
      id: Date.now(),
      text: draft,
      type: 'sent',
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };

    setMessages(prev => ({
      ...prev,
      [activeContact]: [...(prev[activeContact] || []), newMsg]
    }));
    setDraft('');
  };

  return (
    <div className="chat-layout">
      {/* 1. SIDEBAR (Contacts) */}
      <div className="contacts-pane">
        <div className="search-bar">
          <input type="text" placeholder="Filter identities..." className="search-input"/>
        </div>
        <div className="contact-list">
          {contacts.map(c => (
            <div 
              key={c.id} 
              className={`contact-item ${activeContact === c.id ? 'active' : ''}`}
              onClick={() => setActiveContact(c.id)}
            >
              <div style={{fontWeight: 500}}>{c.name}</div>
              <div style={{fontSize: 12, color: '#666'}}>● {c.status}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. CHAT AREA */}
      <div className="thread-pane">
        {!activeContact ? (
          <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#444'}}>
            <p>Select a secure identity to begin encryption.</p>
          </div>
        ) : (
          <>
            <div className="thread-header">
              <span>{contacts.find(c => c.id === activeContact).name}</span>
              <span style={{fontSize: 12, color:'#888', fontFamily:'monospace'}}>E2EE-Active</span>
            </div>

            <div className="message-area">
              {(messages[activeContact] || []).map(msg => (
                <div key={msg.id} className={`msg ${msg.type}`}>
                  <div>{msg.text}</div>
                  <div className="msg-meta">{msg.time}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form className="input-area" onSubmit={handleSend}>
              <input 
                type="text" 
                className="msg-input" 
                placeholder="Type a secure message..." 
                value={draft}
                onChange={e => setDraft(e.target.value)}
                autoFocus
              />
              <button type="submit" className="big-btn" style={{padding: '0 20px'}}>
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}