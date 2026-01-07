require('dotenv').config();
require('express-async-errors');

const logger = require('./utils/logger');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');

const { sequelize } = require('./config/database');
const { getHelmetConfig } = require('./config/helmet');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const {
  doubleCsrfProtection,
  csrfErrorHandler
} = require('./middleware/csrf');
const {
  validateJwtSecret,
  getSecretGenerationInstructions
} = require('./utils/jwtSecretValidator');

// Import OAuth configuration
require('./config/oauth');

// Import routes
const authRoutes = require('./routes/auth');
const playerRoutes = require('./routes/players');
const teamRoutes = require('./routes/teams');
const reportRoutes = require('./routes/reports');
const recruitRoutes = require('./routes/recruits');
const scheduleRoutes = require('./routes/schedules');
const scheduleTemplateRoutes = require('./routes/scheduleTemplates');
const scheduleEventRoutes = require('./routes/scheduleEvents');
const locationRoutes = require('./routes/locations');
const depthChartRoutes = require('./routes/depthCharts');
const settingsRoutes = require('./routes/settings');
const gamesRoutes = require('./routes/games');
const coachRoutes = require('./routes/coaches');
const scoutRoutes = require('./routes/scouts');
const vendorRoutes = require('./routes/vendors');
const highSchoolCoachRoutes = require('./routes/highSchoolCoaches');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for rate limiting behind nginx
app.set('trust proxy', 1);

// Security middleware
app.use(helmet(getHelmetConfig()));

// Parse CORS origins - support comma-separated list
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
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

// Cookie parsing middleware (required for CSRF protection)
app.use(cookieParser());

// CSRF protection middleware for state-changing routes
// Automatically protects POST, PUT, PATCH, DELETE routes
// GET, HEAD, OPTIONS are exempted as safe methods
app.use(doubleCsrfProtection);

// Serve static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint (no CSRF required for GET)
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
app.use('/api/schedule-templates', scheduleTemplateRoutes);
app.use('/api/schedule-events', scheduleEventRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/depth-charts', depthChartRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/coaches', coachRoutes);
app.use('/api/scouts', scoutRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/high-school-coaches', highSchoolCoachRoutes);

// Error handling middleware
app.use(csrfErrorHandler); // Handle CSRF validation errors
app.use(notFound);
app.use(errorHandler);

// Database connection and server startup
const startServer = async () => {
  try {
    // Validate JWT_SECRET before proceeding with startup
    const jwtValidation = validateJwtSecret(process.env.JWT_SECRET);
    const nodeEnv = process.env.NODE_ENV || 'development';
    const isStrictMode = ['production', 'staging'].includes(nodeEnv);

    if (!jwtValidation.valid) {
      logger.error('\n❌ JWT_SECRET SECURITY ERROR');
      logger.error('═'.repeat(50));
      jwtValidation.errors.forEach(err => {
        logger.error(`  • ${err}`);
      });
      logger.error('═'.repeat(50));
      logger.error('\n' + getSecretGenerationInstructions());
      logger.error('');

      if (isStrictMode) {
<<<<<<< HEAD
        console.error(`\n🛑 Server startup aborted. Fix JWT_SECRET before deploying to ${nodeEnv}.\n`);
        process.exit(1); // eslint-disable-line no-process-exit
=======
        logger.error(`\n🛑 Server startup aborted. Fix JWT_SECRET before deploying to ${nodeEnv}.\n`);
        process.exit(1);
>>>>>>> auto-claude/021-remove-sensitive-data-from-production-logs
      } else {
        logger.warn('\n⚠️  WARNING: Starting server with weak JWT_SECRET (development mode only)');
        logger.warn('   DO NOT deploy to production with this configuration!\n');
      }
    } else if (jwtValidation.warnings.length > 0) {
      logger.warn('\n⚠️  JWT_SECRET warnings:');
      jwtValidation.warnings.forEach(warn => {
        logger.warn(`  • ${warn}`);
      });
      logger.warn('');
    }

    await sequelize.authenticate();
<<<<<<< HEAD
    console.log('✅ Database connection established successfully.');
=======
    logger.info('✅ Database connection established successfully.');
>>>>>>> auto-claude/021-remove-sensitive-data-from-production-logs

    // Sync database (in development and staging)
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'staging') {
      await sequelize.sync({ alter: true });
      logger.info('✅ Database synchronized.');
    }

    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
<<<<<<< HEAD
    console.error('❌ Unable to start server:', error);
    process.exit(1); // eslint-disable-line no-process-exit
=======
    logger.error('❌ Unable to start server:', error);
    process.exit(1);
>>>>>>> auto-claude/021-remove-sensitive-data-from-production-logs
  }
};

// Only start the server when this file is run directly (not when imported for testing)
if (require.main === module) {
  startServer();
}

// Export app for testing
module.exports = app;

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 SIGTERM received, shutting down gracefully');
  await sequelize.close();
  process.exit(0); // eslint-disable-line no-process-exit
});

process.on('SIGINT', async () => {
  logger.info('🛑 SIGINT received, shutting down gracefully');
  await sequelize.close();
  process.exit(0); // eslint-disable-line no-process-exit
});