import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { Send, ArrowLeft, Video, Phone } from 'lucide-react';

const PrivateChat = ({ username }) => {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null); // { id, username }
  const [messages, setMessages] = useState({}); // { [userId]: [{from, content}] }
  const [inputValue, setInputValue] = useState('');
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!username) {
      navigate('/');
      return;
    }

    const handleOnlineUsers = (users) => {
      // users is an array of [socketId, username]
      setOnlineUsers(users.filter(([id, name]) => id !== socket.id));
    };

    const handlePrivateMessage = (data) => {
      // data: { from: username, content: string, fromId: socketId }
      setMessages((prev) => {
        const chatHistory = prev[data.fromId] || [];
        return {
          ...prev,
          [data.fromId]: [...chatHistory, { from: data.from, content: data.content, isMe: false }]
        };
      });
    };

    socket.on('online_users', handleOnlineUsers);
    socket.on('private_message', handlePrivateMessage);

    return () => {
      socket.off('online_users', handleOnlineUsers);
      socket.off('private_message', handlePrivateMessage);
    };
  }, [username, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedUser]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputValue.trim() && selectedUser) {
      // Optistic update
      setMessages((prev) => {
        const chatHistory = prev[selectedUser.id] || [];
        return {
          ...prev,
          [selectedUser.id]: [...chatHistory, { from: username, content: inputValue, isMe: true }]
        };
      });

      socket.emit('private_message', { to: selectedUser.id, from: username, content: inputValue });
      setInputValue('');
    }
  };

  const startCall = (type) => {
    if (!selectedUser) return;
    // Emit a custom event that VideoCall component will listen to or handle state
    // We can just emit via document event to trigger the VideoCall component
    const event = new CustomEvent('initiate_call', { detail: { userToCall: selectedUser.id, name: selectedUser.username, type } });
    window.dispatchEvent(event);
  };

  return (
    <div className="chat-layout">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn-icon" onClick={() => navigate('/')}><ArrowLeft /></button>
            <h3>Chats</h3>
          </div>
          <div style={{ marginTop: '10px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Logged in as {username}
          </div>
        </div>

        <div className="user-list">
          {onlineUsers.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>No one is online right now.</div>
          ) : (
            onlineUsers.map(([id, name]) => (
              <div 
                key={id} 
                className={`user-item ${selectedUser?.id === id ? 'active' : ''}`}
                onClick={() => setSelectedUser({ id, username: name })}
              >
                <div className="user-avatar">{name.charAt(0).toUpperCase()}</div>
                <div>{name}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="chat-area">
        {selectedUser ? (
          <>
            <div className="chat-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="user-avatar" style={{ width: '36px', height: '36px' }}>
                  {selectedUser.username.charAt(0).toUpperCase()}
                </div>
                <h3>{selectedUser.username}</h3>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn-icon" onClick={() => startCall('audio')} title="Voice Call"><Phone size={20} /></button>
                <button className="btn-icon" onClick={() => startCall('video')} title="Video Call"><Video size={20} /></button>
              </div>
            </div>

            <div className="chat-messages">
              {(messages[selectedUser.id] || []).map((msg, idx) => (
                <div key={idx} className={`message-wrapper ${msg.isMe ? 'sent' : 'received'} animate-fade-in`}>
                  <div className="message-bubble">{msg.content}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-area" onSubmit={sendMessage}>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Type a message..." 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />
              <button type="submit" className="btn btn-primary"><Send size={18} /></button>
            </form>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Select a user to start chatting
          </div>
        )}
      </div>
    </div>
  );
};

export default PrivateChat;
