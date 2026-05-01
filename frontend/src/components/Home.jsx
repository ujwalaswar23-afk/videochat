import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { MessageSquare, Globe } from 'lucide-react';

const Home = ({ username, setUsername }) => {
  const navigate = useNavigate();
  const [inputName, setInputName] = useState(username);

  const handleLogin = (e) => {
    e.preventDefault();
    if (inputName.trim()) {
      setUsername(inputName);
      localStorage.setItem('username', inputName);
      socket.emit('login', inputName);
      navigate('/chat');
    }
  };

  const joinWorldChat = () => {
    navigate('/world');
  };

  return (
    <div className="app-container">
      <div className="home-container glass-panel animate-fade-in">
        <h1 className="home-title">Ujwal's Chat</h1>
        <p className="home-subtitle">Connect with anyone, anywhere.</p>
        
        <form className="login-form" onSubmit={handleLogin}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Enter your username to login..." 
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            <MessageSquare size={20} /> Join Private Chat
          </button>
        </form>

        <div style={{ margin: '20px 0', color: 'var(--text-muted)' }}>OR</div>

        <button onClick={joinWorldChat} className="btn" style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}>
          <Globe size={20} /> Enter World Chat (Guest)
        </button>
      </div>
    </div>
  );
};

export default Home;
