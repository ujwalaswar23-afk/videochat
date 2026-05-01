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

// Mock database for online users
const onlineUsers = new Map(); // socketId -> username

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // ---- Authentication / User Presence ----
  socket.on('login', (username) => {
    onlineUsers.set(socket.id, username);
    io.emit('online_users', Array.from(onlineUsers.entries()));
    console.log(`${username} logged in with id ${socket.id}`);
  });

  socket.on('logout', () => {
    const username = onlineUsers.get(socket.id);
    onlineUsers.delete(socket.id);
    io.emit('online_users', Array.from(onlineUsers.entries()));
    console.log(`${username} logged out`);
  });

  // ---- World Chat ----
  socket.on('join_world', () => {
    socket.join('world_chat');
    console.log(`${socket.id} joined world chat`);
  });

  socket.on('world_message', (data) => {
    // data: { sender: string, content: string, type: 'text' | 'image' }
    io.to('world_chat').emit('world_message', data);
  });

  // ---- Private Chat ----
  socket.on('private_message', (data) => {
    // data: { to: socketId, from: username, content: string }
    io.to(data.to).emit('private_message', {
      from: data.from,
      content: data.content,
      fromId: socket.id
    });
  });

  // ---- WebRTC Signaling ----
  socket.on('call_user', (data) => {
    // data: { userToCall: socketId, signalData: any, from: username }
    io.to(data.userToCall).emit('call_incoming', {
      signal: data.signalData,
      from: data.from,
      fromId: socket.id
    });
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
    if (onlineUsers.has(socket.id)) {
      onlineUsers.delete(socket.id);
      io.emit('online_users', Array.from(onlineUsers.entries()));
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
