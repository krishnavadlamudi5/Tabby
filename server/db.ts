import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tabby';

export async function connectDB() {
  try {
    if (mongoose.connection.readyState >= 1) {
      return;
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB successfully!');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    // Don't crash immediately in dev mode, log error clearly
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Reconnecting...');
});
