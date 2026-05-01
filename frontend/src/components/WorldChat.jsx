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
      setMessages((prev) => [...prev, data]);
    };

    socket.on('world_message', handleMessage);

    return () => {
      socket.off('world_message', handleMessage);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      socket.emit('world_message', { sender: username, content: inputValue, type: 'text' });
      setInputValue('');
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        socket.emit('world_message', { sender: username, content: event.target.result, type: 'image' });
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
                  {msg.type === 'text' ? (
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
