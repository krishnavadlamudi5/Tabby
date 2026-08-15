import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './db';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import groupRoutes from './routes/groups';
import expenseRoutes from './routes/expenses';
import activityRoutes from './routes/activities';
import syncRoutes from './routes/sync';

import { seedDemoData } from './seedDemo';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Database connection check middleware
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({
      error: 'MongoDB is not connected yet. Please check your database password in the .env file and restart the server.'
    });
    return;
  }
  next();
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Tabby API (MongoDB)' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/sync', syncRoutes);

// Start Server
async function startServer() {
  await connectDB();
  if (mongoose.connection.readyState === 1) {
    await seedDemoData();
  }
  app.listen(PORT, () => {
    console.log(`🚀 Tabby Backend Server running at http://localhost:${PORT}`);
  });
}

startServer();
