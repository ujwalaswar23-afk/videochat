import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

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

// User mapping
const socketToUser = new Map(); // socket.id -> username
const userToSockets = new Map(); // username -> Set<socket.id>

// Chat History
let chatHistory = []; // Array of message objects

// Cleanup interval (45 minutes)
const FORTY_FIVE_MINUTES = 45 * 60 * 1000;
setInterval(() => {
  const cutoffTime = Date.now() - FORTY_FIVE_MINUTES;
  const originalLength = chatHistory.length;
  chatHistory = chatHistory.filter(msg => msg.timestamp > cutoffTime);
  if (originalLength !== chatHistory.length) {
    console.log(`Cleaned up ${originalLength - chatHistory.length} old messages.`);
  }
}, 60000); // Check every minute

const emitOnlineUsers = () => {
  // Return array of unique online usernames
  const users = Array.from(userToSockets.keys()).filter(u => userToSockets.get(u).size > 0);
  io.emit('online_users', users);
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // ---- Authentication / User Presence ----
  socket.on('login', (username) => {
    socketToUser.set(socket.id, username);
    
    if (!userToSockets.has(username)) {
      userToSockets.set(username, new Set());
    }
    userToSockets.get(username).add(socket.id);
    
    emitOnlineUsers();
    console.log(`${username} logged in with id ${socket.id}`);

    // Send history relevant to this user
    const userHistory = chatHistory.filter(msg => 
      msg.type === 'world' || 
      (msg.type === 'private' && (msg.from === username || msg.to === username))
    );
    socket.emit('chat_history', userHistory);
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
    
    // Send only world chat history to this socket
    const worldHistory = chatHistory.filter(msg => msg.type === 'world');
    socket.emit('world_history', worldHistory);
  });

  socket.on('world_message', (data) => {
    // data: { sender: string, content: string, type: 'text' | 'image' }
    const message = {
      type: 'world',
      sender: data.sender,
      content: data.content,
      msgType: data.type,
      timestamp: Date.now()
    };
    chatHistory.push(message);
    io.to('world_chat').emit('world_message', message);
  });

  // ---- Private Chat ----
  socket.on('private_message', (data) => {
    // data: { to: username, from: username, content: string }
    const message = {
      type: 'private',
      from: data.from,
      to: data.to,
      content: data.content,
      timestamp: Date.now()
    };
    chatHistory.push(message);

    // Send to recipient
    const recipientSockets = userToSockets.get(data.to);
    if (recipientSockets) {
      for (const socketId of recipientSockets) {
        io.to(socketId).emit('private_message', message);
      }
    }
    
    // Also echo back to other tabs of the sender
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
  // We keep WebRTC using socket IDs for now since calls are direct point-to-point and immediate.
  // But we need to translate from username to socketId for calls.
  socket.on('call_user', (data) => {
    // data: { userToCall: username, signalData: any, from: username }
    const recipientSockets = userToSockets.get(data.userToCall);
    if (recipientSockets && recipientSockets.size > 0) {
      // Just call the first active socket for simplicity
      const socketId = Array.from(recipientSockets)[0];
      io.to(socketId).emit('call_incoming', {
        signal: data.signalData,
        from: data.from,
        fromId: socket.id // They need this to answer
      });
    }
  });

  socket.on('answer_call', (data) => {
    // data: { to: socketId, signal: any }
    io.to(data.to).emit('call_accepted', data.signal);
  });

  socket.on('end_call', (data) => {
    // data: { to: socketId }
    io.to(data.to).emit('call_ended');
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
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
