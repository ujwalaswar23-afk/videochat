import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { Send, Image as ImageIcon, ArrowLeft } from 'lucide-react';

const WorldChat = ({ username }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  useEffect(() => {
    socket.emit('join_world');

    const handleMessage = (data) => {
      setMessages((prev) => {
        // Prevent duplicate if we already have it
        if (prev.some(m => m.timestamp === data.timestamp)) return prev;
        return [...prev, data];
      });
    };

    const handleHistory = (historyArr) => {
      setMessages(historyArr);
    };

    socket.on('world_message', handleMessage);
    socket.on('world_history', handleHistory);

    return () => {
      socket.off('world_message', handleMessage);
      socket.off('world_history', handleHistory);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      const msg = { sender: username, content: inputValue, type: 'text' };
      // Optimistic update — server no longer echoes back to sender
      setMessages((prev) => [...prev, { ...msg, msgType: 'text', timestamp: Date.now() }]);
      socket.emit('world_message', msg);
      setInputValue('');
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const msg = { sender: username, content: event.target.result, type: 'image' };
        setMessages((prev) => [...prev, { ...msg, msgType: 'image', timestamp: Date.now() }]);
        socket.emit('world_message', msg);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="chat-layout">
      <div className="chat-area" style={{ width: '100vw' }}>
        <div className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="btn-icon" onClick={() => navigate('/')}><ArrowLeft /></button>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              World Chat <span className="world-chat-badge">Public</span>
            </h2>
          </div>
          <div>Logged in as: <strong>{username}</strong></div>
        </div>

        <div className="chat-messages">
          {messages.map((msg, idx) => {
            const isMe = msg.sender === username;
            return (
              <div key={idx} className={`message-wrapper ${isMe ? 'sent' : 'received'} animate-fade-in`}>
                {!isMe && <div className="message-sender">{msg.sender}</div>}
                <div className="message-bubble">
                  {(msg.msgType === 'text' || msg.type === 'text') ? (
                    msg.content
                  ) : (
                    <img src={msg.content} alt="Shared" style={{ maxWidth: '300px', borderRadius: '8px' }} />
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-input-area" onSubmit={sendMessage}>
          <label className="btn-icon" style={{ cursor: 'pointer' }}>
            <ImageIcon />
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
          </label>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Type a message or emoji... 😎🌍" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button type="submit" className="btn btn-primary"><Send size={18} /></button>
        </form>
      </div>
    </div>
  );
};

export default WorldChat;
