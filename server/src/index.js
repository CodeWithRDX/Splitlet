const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const db = require('./db');
const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');
const expenseRoutes = require('./routes/expenses');
const settlementRoutes = require('./routes/settlements');
const balanceRoutes = require('./routes/balances');
const importRoutes = require('./routes/import');

const app = express();
const server = http.createServer(app);

// Configure CORS
const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Bind REST API routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/balances', balanceRoutes);
app.use('/api/import', importRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date() });
});

// Configure Socket.io
const io = new Server(server, {
  cors: corsOptions
});
app.set('socketio', io);

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join a room for a specific expense
  socket.on('join_expense', (expenseId) => {
    socket.join(`expense_${expenseId}`);
    console.log(`Socket ${socket.id} joined room expense_${expenseId}`);
  });

  // Leave a room for a specific expense
  socket.on('leave_expense', (expenseId) => {
    socket.leave(`expense_${expenseId}`);
    console.log(`Socket ${socket.id} left room expense_${expenseId}`);
  });

  // Join a room for a specific group
  socket.on('join_group', (groupId) => {
    socket.join(`group_${groupId}`);
    console.log(`Socket ${socket.id} joined room group_${groupId}`);
  });

  // Leave a room for a specific group
  socket.on('leave_group', (groupId) => {
    socket.leave(`group_${groupId}`);
    console.log(`Socket ${socket.id} left room group_${groupId}`);
  });

  // Handle typing status in group chat
  socket.on('typing', (data) => {
    const { groupId, userId, userName } = data;
    socket.to(`group_${groupId}`).emit('typing', { userId, userName });
  });

  // Handle stop typing status in group chat
  socket.on('stop_typing', (data) => {
    const { groupId, userId } = data;
    socket.to(`group_${groupId}`).emit('stop_typing', { userId });
  });

  // Handle sendMessage via socket directly (optional redundancy for API)
  socket.on('sendMessage', async (data) => {
    const { groupId, senderId, message, senderName } = data;
    if (!groupId || !senderId || !message) return;
    io.to(`group_${groupId}`).emit('receiveMessage', {
      id: Math.floor(Math.random() * 1000000), // temp id if not using REST API
      groupId,
      senderId,
      message,
      createdAt: new Date(),
      editedAt: null,
      senderName
    });
  });

  // Handle sending message inside an expense chat room
  socket.on('send_message', async (data) => {
    const { expenseId, userId, userName, content } = data;

    if (!expenseId || !userId || !content) {
      return;
    }

    try {
      // 1. Insert chat message into the database
      const [result] = await db.query(
        'INSERT INTO chat_messages (expense_id, user_id, content) VALUES (?, ?, ?)',
        [expenseId, userId, content]
      );

      const messageId = result.insertId;
      const timestamp = new Date();

      // 2. Broadcast message to all clients in the room
      io.to(`expense_${expenseId}`).emit('new_message', {
        id: messageId,
        expenseId,
        userId,
        userName,
        content,
        timestamp
      });
    } catch (error) {
      console.error('Socket error inserting message:', error);
      // Optionally notify sender of the error
      socket.emit('message_error', { error: 'Failed to send message.' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Start the server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
