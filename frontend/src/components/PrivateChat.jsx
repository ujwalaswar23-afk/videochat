import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { Send, ArrowLeft, Video, Phone } from 'lucide-react';

const PrivateChat = ({ username }) => {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [historyUsers, setHistoryUsers] = useState(new Set()); // Users we have chat history with
  const [selectedUser, setSelectedUser] = useState(null); // username string
  const [messages, setMessages] = useState({}); // { [username]: [{from, content}] }
  const [inputValue, setInputValue] = useState('');
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!username) {
      navigate('/');
      return;
    }

    const handleOnlineUsers = (users) => {
      // users is an array of usernames
      setOnlineUsers(users.filter(name => name !== username));
    };

    const handlePrivateMessage = (msg) => {
      // msg: { from: username, to: username, content: string, timestamp: number }
      setMessages((prev) => {
        const otherUser = msg.from === username ? msg.to : msg.from;
        const chatHistory = prev[otherUser] || [];
        
        // Check if message already exists (prevent duplicate on optimistic update)
        if (chatHistory.some(m => m.timestamp === msg.timestamp)) return prev;

        return {
          ...prev,
          [otherUser]: [...chatHistory, { from: msg.from, content: msg.content, isMe: msg.from === username, timestamp: msg.timestamp }]
        };
      });

      setHistoryUsers(prev => {
        const otherUser = msg.from === username ? msg.to : msg.from;
        if (!prev.has(otherUser)) {
          return new Set(prev).add(otherUser);
        }
        return prev;
      });
    };

    const handleChatHistory = (historyArr) => {
      const privateMsgs = historyArr.filter(msg => msg.type === 'private');
      const newMessages = {};
      const newHistoryUsers = new Set();

      privateMsgs.forEach(msg => {
        const otherUser = msg.from === username ? msg.to : msg.from;
        if (!newMessages[otherUser]) newMessages[otherUser] = [];
        newMessages[otherUser].push({ from: msg.from, content: msg.content, isMe: msg.from === username, timestamp: msg.timestamp });
        newHistoryUsers.add(otherUser);
      });

      setMessages(newMessages);
      setHistoryUsers(newHistoryUsers);
    };

    socket.on('online_users', handleOnlineUsers);
    socket.on('private_message', handlePrivateMessage);
    socket.on('chat_history', handleChatHistory);

    // Request login/history again if component remounts while connected
    if (socket.connected) {
      socket.emit('login', username);
    }

    return () => {
      socket.off('online_users', handleOnlineUsers);
      socket.off('private_message', handlePrivateMessage);
      socket.off('chat_history', handleChatHistory);
    };
  }, [username, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedUser]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputValue.trim() && selectedUser) {
      const timestamp = Date.now();
      // Optimistic update
      setMessages((prev) => {
        const chatHistory = prev[selectedUser] || [];
        return {
          ...prev,
          [selectedUser]: [...chatHistory, { from: username, content: inputValue, isMe: true, timestamp }]
        };
      });

      setHistoryUsers(prev => {
        if (!prev.has(selectedUser)) {
          return new Set(prev).add(selectedUser);
        }
        return prev;
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

  // Combine online users and users we have history with
  const allSidebarUsers = Array.from(new Set([...onlineUsers, ...Array.from(historyUsers)])).filter(name => name !== username);

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
          {allSidebarUsers.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>No chats yet.</div>
          ) : (
            allSidebarUsers.map((name) => {
              const isOnline = onlineUsers.includes(name);
              return (
                <div 
                  key={name} 
                  className={`user-item ${selectedUser === name ? 'active' : ''}`}
                  onClick={() => setSelectedUser(name)}
                >
                  <div className="user-avatar" style={{ position: 'relative' }}>
                    {name.charAt(0).toUpperCase()}
                    {isOnline && <div style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', background: 'var(--accent-success)', borderRadius: '50%', border: '2px solid var(--bg-panel)' }}></div>}
                  </div>
                  <div>{name}</div>
                </div>
              );
            })
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
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Select a user to start chatting
          </div>
        )}
      </div>
    </div>
  );
};

export default PrivateChat;
