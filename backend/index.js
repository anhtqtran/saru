require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./middleware/logger');
const { correlationIdMiddleware } = require('./middleware/correlationId');
const { connectDB } = require('./utils/db');

// Route imports
const productRoutes = require('./routes/productRoutes');
const authRoutes = require('./routes/authRoutes');
const cartRoutes = require('./routes/cartRoutes');
const compareRoutes = require('./routes/compareRoutes');
const blogRoutes = require('./routes/blogRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const faqRoutes = require('./routes/faqRoutes');
const customerRoutes = require('./routes/customerRoutes');
const membershipRoutes = require('./routes/membershipRoutes');
const orderRoutes = require('./routes/orderRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const stockRoutes = require('./routes/stockRoutes');
const messageRoutes = require('./routes/messageRoutes');
const emailRoutes = require('./routes/emailRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:4001', 'http://localhost:4002', 'http://localhost:4200'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
const port = process.env.PORT || 4000;

// Session configuration
const sessionMaxAge = parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000;
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: sessionMaxAge,
    },
  })
);

// Middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(
  cors({
    origin: ['http://localhost:4001', 'http://localhost:4002', 'http://localhost:4200'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(correlationIdMiddleware);
app.use(
  morgan(':method :url :status :res[content-length] - :response-time ms - correlationId: :correlationId', {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// Register routes
app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/compare', compareRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/memberships', membershipRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/feedbacks', feedbackRoutes);
app.use('/api/productstocks', stockRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/email', emailRoutes);

// WebSocket handling
const clients = new Map();
const messageCollection = require('./utils/db').collections.messageCollection;

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('register', (userName) => {
    clients.set(userName, socket.id);
    logger.info(`User ${userName} registered with socket ID: ${socket.id}`, { correlationId: 'socket' });
  });

  socket.on('sendMessage', async (data) => {
    console.log('Tin nhắn nhận được:', data);
    if (!data.targetUser) {
      logger.warn('Thiếu targetUser trong dữ liệu gửi đến server', { correlationId: 'socket' });
      return;
    }

    const newMessage = {
      user: data.user,
      message: data.message,
      targetUser: data.targetUser,
      timestamp: new Date(),
    };
    await messageCollection.insertOne(newMessage);
    logger.info('Đã lưu tin nhắn vào MongoDB', { message: newMessage, correlationId: 'socket' });

    const targetSocketId = clients.get(data.targetUser);
    if (targetSocketId) {
      io.to(targetSocketId).emit('receiveMessage', {
        user: data.user,
        message: data.message,
        targetUser: data.targetUser,
      });
      logger.info(`Đã gửi tin nhắn đến ${data.targetUser} (socket ID: ${targetSocketId})`, { correlationId: 'socket' });
    } else {
      logger.warn(`Không tìm thấy socket ID cho người dùng: ${data.targetUser}`, { correlationId: 'socket' });
    }
  });

  socket.on('disconnect', () => {
    for (const [userName, socketId] of clients.entries()) {
      if (socketId === socket.id) {
        clients.delete(userName);
        logger.info(`User ${userName} disconnected`, { correlationId: 'socket' });
        break;
      }
    }
  });
});

// Start server
async function startServer() {
  try {
    await connectDB();
    server.listen(port, () => {
      logger.info(`Server running on port ${port}`, { correlationId: 'system' });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message, correlationId: 'system' });
    process.exit(1);
  }
}

startServer();

process.on('SIGTERM', async () => {
  await require('./utils/db').client.close();
  logger.info('MongoDB connection closed', { correlationId: 'system' });
  process.exit(0);
});