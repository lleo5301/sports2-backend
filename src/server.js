require('dotenv').config();
require('express-async-errors');

const logger = require('./utils/logger');
const SyncScheduler = require('./services/syncScheduler');
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
const integrationRoutes = require('./routes/integrations');
const prospectRoutes = require('./routes/prospects');
const rosterRoutes = require('./routes/rosters');
const newsRoutes = require('./routes/news');
const teamStatsRoutes = require('./routes/teams/stats');

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

// Health check endpoints (no CSRF required for GET)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: 'v1'
  });
});

// API v1 routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/players', playerRoutes);
app.use('/api/v1/teams', teamStatsRoutes);
app.use('/api/v1/teams', teamRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/recruits', recruitRoutes);
app.use('/api/v1/schedules', scheduleRoutes);
app.use('/api/v1/schedule-templates', scheduleTemplateRoutes);
app.use('/api/v1/schedule-events', scheduleEventRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/depth-charts', depthChartRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/games', gamesRoutes);
app.use('/api/v1/coaches', coachRoutes);
app.use('/api/v1/scouts', scoutRoutes);
app.use('/api/v1/vendors', vendorRoutes);
app.use('/api/v1/high-school-coaches', highSchoolCoachRoutes);
app.use('/api/v1/integrations', integrationRoutes);
app.use('/api/v1/prospects', prospectRoutes);
app.use('/api/v1/rosters', rosterRoutes);
app.use('/api/v1/news', newsRoutes);

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
        logger.error(`\n🛑 Server startup aborted. Fix JWT_SECRET before deploying to ${nodeEnv}.\n`);
        process.exit(1); // eslint-disable-line no-process-exit
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
    logger.info('✅ Database connection established successfully.');

    // Sync database (in development and staging)
    // Note: Disabled alter sync due to migration conflicts - use migrations instead
    // if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'staging') {
    //   await sequelize.sync({ alter: true });
    //   logger.info('✅ Database synchronized.');
    // }

    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/health`);

      // Start sync scheduler in production and development (not test)
      // Set DISABLE_SYNC=true in docker-compose to prevent automatic Presto API calls
      if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_SYNC !== 'true') {
        const syncScheduler = new SyncScheduler();
        syncScheduler.start();
        app.locals.syncScheduler = syncScheduler;
      } else if (process.env.DISABLE_SYNC === 'true') {
        logger.info('Sync scheduler disabled (DISABLE_SYNC=true)');
      }
    });
  } catch (error) {
    logger.error('❌ Unable to start server:', error);
    process.exit(1); // eslint-disable-line no-process-exit
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
  if (app.locals.syncScheduler) {
    app.locals.syncScheduler.stop();
  }
  await sequelize.close();
  process.exit(0); // eslint-disable-line no-process-exit
});

process.on('SIGINT', async () => {
  logger.info('🛑 SIGINT received, shutting down gracefully');
  if (app.locals.syncScheduler) {
    app.locals.syncScheduler.stop();
  }
  await sequelize.close();
  process.exit(0); // eslint-disable-line no-process-exit
});
