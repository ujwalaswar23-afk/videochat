import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { socket } from './socket';
import Home from './components/Home';
import WorldChat from './components/WorldChat';
import PrivateChat from './components/PrivateChat';
import VideoCall from './components/VideoCall';
import './App.css';

function App() {
  const [username, setUsername] = useState(localStorage.getItem('username') || '');

  useEffect(() => {
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home username={username} setUsername={setUsername} />} />
        <Route path="/world" element={<WorldChat username={username || 'Guest'} />} />
        <Route path="/chat" element={<PrivateChat username={username} />} />
      </Routes>
      
      {/* VideoCall overlay can be placed here so it's accessible across routes */}
      <VideoCall username={username} />
    </Router>
  );
}

export default App;
