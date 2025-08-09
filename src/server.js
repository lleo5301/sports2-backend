require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { sequelize } = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

// Import OAuth configuration
require('./config/oauth');

// Import routes
const authRoutes = require('./routes/auth');
const playerRoutes = require('./routes/players');
const teamRoutes = require('./routes/teams');
const reportRoutes = require('./routes/reports');
const recruitRoutes = require('./routes/recruits');
const scheduleRoutes = require('./routes/schedules');
const depthChartRoutes = require('./routes/depthCharts');
const settingsRoutes = require('./routes/settings');
const gamesRoutes = require('./routes/games');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for rate limiting behind nginx
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100000, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Serve static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/recruits', recruitRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/depth-charts', depthChartRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/games', gamesRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Database connection and server startup
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    
    // Sync database (in development)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('✅ Database synchronized.');
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Unable to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  await sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  await sequelize.close();
  process.exit(0);
}); 