import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { MessageSquare, Globe, UserPlus, LogIn } from 'lucide-react';

const Home = ({ username, setUsername }) => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [inputName, setInputName] = useState('');
  const [inputPassword, setInputPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!inputName.trim() || !inputPassword.trim()) {
      setErrorMsg('Username and password are required');
      return;
    }

    if (isLogin) {
      socket.emit('login', { username: inputName, password: inputPassword }, (response) => {
        if (response.success) {
          setUsername(inputName);
          localStorage.setItem('username', inputName);
          navigate('/chat');
        } else {
          setErrorMsg(response.message || 'Login failed');
        }
      });
    } else {
      socket.emit('register', { username: inputName, password: inputPassword }, (response) => {
        if (response.success) {
          // Auto login after registration
          socket.emit('login', { username: inputName, password: inputPassword }, () => {
            setUsername(inputName);
            localStorage.setItem('username', inputName);
            navigate('/chat');
          });
        } else {
          setErrorMsg(response.message || 'Registration failed');
        }
      });
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
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '20px' }}>
          <button 
            className="btn" 
            style={{ background: isLogin ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)' }}
            onClick={() => { setIsLogin(true); setErrorMsg(''); }}
          >
            <LogIn size={16} /> Login
          </button>
          <button 
            className="btn" 
            style={{ background: !isLogin ? 'var(--accent-secondary)' : 'rgba(255,255,255,0.1)' }}
            onClick={() => { setIsLogin(false); setErrorMsg(''); }}
          >
            <UserPlus size={16} /> Register
          </button>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Username" 
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
          />
          <input 
            type="password" 
            className="input-field" 
            placeholder="Password" 
            value={inputPassword}
            onChange={(e) => setInputPassword(e.target.value)}
          />
          
          {errorMsg && <div style={{ color: 'var(--accent-danger)', fontSize: '0.9rem' }}>{errorMsg}</div>}
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
            <MessageSquare size={20} /> {isLogin ? 'Enter Private Chat' : 'Create Account'}
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
