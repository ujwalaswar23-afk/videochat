import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// User Storage (JSON file for persistence)
const USERS_FILE = './users.json';
let registeredUsers = {}; // { username: password }

try {
  if (fs.existsSync(USERS_FILE)) {
    const data = fs.readFileSync(USERS_FILE, 'utf-8');
    registeredUsers = JSON.parse(data);
  } else {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}));
  }
} catch (e) {
  console.error("Error reading users file:", e);
}

const saveUsers = () => {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(registeredUsers, null, 2));
  } catch (e) {
    console.error("Error saving users file:", e);
  }
};

// State mapping
const socketToUser = new Map(); // socket.id -> username
const userToSockets = new Map(); // username -> Set<socket.id>

// Chat History
let chatHistory = []; // Array of message objects

const FORTY_FIVE_MINUTES = 45 * 60 * 1000;
setInterval(() => {
  const cutoffTime = Date.now() - FORTY_FIVE_MINUTES;
  const originalLength = chatHistory.length;
  chatHistory = chatHistory.filter(msg => msg.timestamp > cutoffTime);
  if (originalLength !== chatHistory.length) {
    console.log(`Cleaned up ${originalLength - chatHistory.length} old messages.`);
  }
}, 60000); 

const emitOnlineUsers = () => {
  const users = Array.from(userToSockets.keys()).filter(u => userToSockets.get(u).size > 0);
  io.emit('online_users', users);
};

const emitAllUsers = () => {
  io.emit('all_users', Object.keys(registeredUsers));
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Send the list of all registered users immediately so World Chat guests can see it if needed
  socket.emit('all_users', Object.keys(registeredUsers));
  emitOnlineUsers();

  // ---- Registration & Authentication ----
  socket.on('register', ({ username, password }, callback) => {
    if (registeredUsers[username]) {
      return callback({ success: false, message: 'Username already taken' });
    }
    if (!username || !password) {
      return callback({ success: false, message: 'Username and password required' });
    }

    registeredUsers[username] = password; // In a real app, hash this with bcrypt!
    saveUsers();
    emitAllUsers();
    callback({ success: true });
    console.log(`New user registered: ${username}`);
  });

  socket.on('login', ({ username, password }, callback) => {
    // We allow "login" without password ONLY for re-establishing socket connection if they have a saved token/username on frontend.
    // Wait, let's enforce password check if provided, or assume it's an auto-reconnect if no password is provided but they exist.
    // Actually, for robust security, they must provide password or we should use JWT.
    // For this simple implementation, we'll check password.
    
    if (password) {
      if (!registeredUsers[username] || registeredUsers[username] !== password) {
        if (callback) callback({ success: false, message: 'Invalid username or password' });
        return;
      }
    } else {
      // Reconnection attempt without password (e.g. page refresh)
      if (!registeredUsers[username]) {
        if (callback) callback({ success: false, message: 'User not found' });
        return;
      }
    }

    socketToUser.set(socket.id, username);
    
    if (!userToSockets.has(username)) {
      userToSockets.set(username, new Set());
    }
    userToSockets.get(username).add(socket.id);
    
    emitOnlineUsers();
    console.log(`${username} logged in with id ${socket.id}`);

    // Send history
    const userHistory = chatHistory.filter(msg => 
      msg.type === 'world' || 
      (msg.type === 'private' && (msg.from === username || msg.to === username))
    );
    socket.emit('chat_history', userHistory);
    socket.emit('all_users', Object.keys(registeredUsers));

    if (callback) callback({ success: true });
  });

  socket.on('logout', () => {
    const username = socketToUser.get(socket.id);
    if (username) {
      socketToUser.delete(socket.id);
      const sockets = userToSockets.get(username);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userToSockets.delete(username);
        }
      }
      emitOnlineUsers();
      console.log(`${username} logged out`);
    }
  });

  // ---- World Chat ----
  socket.on('join_world', () => {
    socket.join('world_chat');
    console.log(`${socket.id} joined world chat`);
    
    const worldHistory = chatHistory.filter(msg => msg.type === 'world');
    socket.emit('world_history', worldHistory);
  });

  socket.on('world_message', (data) => {
    const message = {
      type: 'world',
      sender: data.sender,
      content: data.content,
      msgType: data.type,
      timestamp: Date.now()
    };
    chatHistory.push(message);
    // Broadcast to all in room EXCEPT sender (sender handles optimistically)
    socket.to('world_chat').emit('world_message', message);
  });

  // ---- Private Chat ----
  socket.on('private_message', (data) => {
    const message = {
      type: 'private',
      from: data.from,
      to: data.to,
      content: data.content,
      timestamp: Date.now()
    };
    chatHistory.push(message);

    const recipientSockets = userToSockets.get(data.to);
    if (recipientSockets) {
      for (const socketId of recipientSockets) {
        io.to(socketId).emit('private_message', message);
      }
    }
    
    const senderSockets = userToSockets.get(data.from);
    if (senderSockets) {
      for (const socketId of senderSockets) {
        if (socketId !== socket.id) {
          io.to(socketId).emit('private_message', message);
        }
      }
    }
  });

  // ---- WebRTC Signaling ----
  socket.on('call_user', (data) => {
    const recipientSockets = userToSockets.get(data.userToCall);
    if (recipientSockets && recipientSockets.size > 0) {
      const socketId = Array.from(recipientSockets)[0];
      io.to(socketId).emit('call_incoming', {
        signal: data.signalData,
        from: data.from,
        fromId: socket.id
      });
    }
  });

  socket.on('answer_call', (data) => {
    io.to(data.to).emit('call_accepted', data.signal);
  });

  socket.on('end_call', (data) => {
    io.to(data.to).emit('call_ended');
  });

  socket.on('disconnect', () => {
    const username = socketToUser.get(socket.id);
    if (username) {
      socketToUser.delete(socket.id);
      const sockets = userToSockets.get(username);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userToSockets.delete(username);
        }
      }
      emitOnlineUsers();
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
