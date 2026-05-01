import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { Send, ArrowLeft, Video, Phone, Users } from 'lucide-react';

const PrivateChat = ({ username }) => {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState({});
  const [inputValue, setInputValue] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!username) {
      navigate('/');
      return;
    }

    const handleOnlineUsers = (users) => {
      setOnlineUsers(users.filter(name => name !== username));
    };

    const handleAllUsers = (users) => {
      setAllUsers(users.filter(name => name !== username));
    };

    const handlePrivateMessage = (msg) => {
      setMessages((prev) => {
        const otherUser = msg.from === username ? msg.to : msg.from;
        const chatHistory = prev[otherUser] || [];
        if (chatHistory.some(m => m.timestamp === msg.timestamp)) return prev;
        return {
          ...prev,
          [otherUser]: [...chatHistory, { from: msg.from, content: msg.content, isMe: msg.from === username, timestamp: msg.timestamp }]
        };
      });
    };

    const handleChatHistory = (historyArr) => {
      const privateMsgs = historyArr.filter(msg => msg.type === 'private');
      const newMessages = {};
      privateMsgs.forEach(msg => {
        const otherUser = msg.from === username ? msg.to : msg.from;
        if (!newMessages[otherUser]) newMessages[otherUser] = [];
        newMessages[otherUser].push({ from: msg.from, content: msg.content, isMe: msg.from === username, timestamp: msg.timestamp });
      });
      setMessages(newMessages);
    };

    socket.on('online_users', handleOnlineUsers);
    socket.on('all_users', handleAllUsers);
    socket.on('private_message', handlePrivateMessage);
    socket.on('chat_history', handleChatHistory);

    const requestData = () => {
      socket.emit('login', { username });
      socket.emit('get_all_users');
    };

    if (socket.connected) {
      requestData();
    } else {
      socket.once('connect', requestData);
    }

    // Retry after 1 second to catch any race conditions
    const retryTimeout = setTimeout(() => {
      if (socket.connected) socket.emit('get_all_users');
    }, 1000);

    // Refresh online status every 5 seconds
    const refreshInterval = setInterval(() => {
      if (socket.connected) socket.emit('get_all_users');
    }, 5000);

    return () => {
      socket.off('online_users', handleOnlineUsers);
      socket.off('all_users', handleAllUsers);
      socket.off('private_message', handlePrivateMessage);
      socket.off('chat_history', handleChatHistory);
      clearTimeout(retryTimeout);
      clearInterval(refreshInterval);
    };
  }, [username, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedUser]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputValue.trim() && selectedUser) {
      const timestamp = Date.now();
      setMessages((prev) => {
        const chatHistory = prev[selectedUser] || [];
        return {
          ...prev,
          [selectedUser]: [...chatHistory, { from: username, content: inputValue, isMe: true, timestamp }]
        };
      });
      socket.emit('private_message', { to: selectedUser, from: username, content: inputValue });
      setInputValue('');
    }
  };

  const startCall = (type) => {
    if (!selectedUser) return;
    const event = new CustomEvent('initiate_call', { detail: { userToCall: selectedUser, name: selectedUser, type } });
    window.dispatchEvent(event);
  };

  const selectUser = (name) => {
    setSelectedUser(name);
    setShowSidebar(false);
  };

  const goBackToSidebar = () => {
    setShowSidebar(true);
  };

  return (
    <div className="chat-layout">
      {/* Sidebar */}
      <div className={`sidebar ${showSidebar ? 'sidebar-visible' : 'sidebar-hidden'}`}>
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn-icon" onClick={() => navigate('/')}><ArrowLeft /></button>
            <h3>All Users</h3>
          </div>
          <div style={{ marginTop: '10px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Logged in as {username}
          </div>
        </div>

        <div className="user-list">
          {allUsers.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>No other registered users yet.</div>
          ) : (
            <>
              {/* Online Users Section */}
              {onlineUsers.length > 0 && (
                <>
                  <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent-success)', textTransform: 'uppercase', letterSpacing: '1px', padding: '8px 12px' }}>
                    Online — {onlineUsers.length}
                  </div>
                  {onlineUsers.map((name) => (
                    <div 
                      key={name} 
                      className={`user-item ${selectedUser === name ? 'active' : ''}`}
                      onClick={() => selectUser(name)}
                    >
                      <div className="user-avatar" style={{ position: 'relative' }}>
                        {name.charAt(0).toUpperCase()}
                        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', background: 'var(--accent-success)', borderRadius: '50%', border: '2px solid var(--bg-panel)' }}></div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold' }}>{name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--accent-success)' }}>Online</div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Offline Users Section */}
              {allUsers.filter(n => !onlineUsers.includes(n)).length > 0 && (
                <>
                  <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', padding: '8px 12px', marginTop: onlineUsers.length > 0 ? '12px' : '0' }}>
                    Offline — {allUsers.filter(n => !onlineUsers.includes(n)).length}
                  </div>
                  {allUsers.filter(n => !onlineUsers.includes(n)).map((name) => (
                    <div 
                      key={name} 
                      className={`user-item ${selectedUser === name ? 'active' : ''}`}
                      onClick={() => selectUser(name)}
                      style={{ opacity: 0.6 }}
                    >
                      <div className="user-avatar" style={{ position: 'relative', background: 'rgba(255,255,255,0.15)' }}>
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold' }}>{name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Offline</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`chat-area ${!showSidebar ? 'chat-visible' : 'chat-hidden'}`}>
        {selectedUser ? (
          <>
            <div className="chat-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button className="btn-icon mobile-back-btn" onClick={goBackToSidebar}><ArrowLeft size={20} /></button>
                <div className="user-avatar" style={{ width: '36px', height: '36px' }}>
                  {selectedUser.charAt(0).toUpperCase()}
                </div>
                <h3>{selectedUser}</h3>
                {!onlineUsers.includes(selectedUser) && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(Offline)</span>}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn-icon" onClick={() => startCall('audio')} title="Voice Call" disabled={!onlineUsers.includes(selectedUser)} style={{ opacity: onlineUsers.includes(selectedUser) ? 1 : 0.5 }}><Phone size={20} /></button>
                <button className="btn-icon" onClick={() => startCall('video')} title="Video Call" disabled={!onlineUsers.includes(selectedUser)} style={{ opacity: onlineUsers.includes(selectedUser) ? 1 : 0.5 }}><Video size={20} /></button>
              </div>
            </div>

            <div className="chat-messages">
              {(messages[selectedUser] || []).map((msg, idx) => (
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
          <div className="empty-chat-placeholder">
            <Users size={48} style={{ opacity: 0.5 }} />
            <h3>Welcome to Private Chat</h3>
            <p>Select any registered user from the sidebar to start chatting!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrivateChat;
