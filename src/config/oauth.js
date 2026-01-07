const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AppleStrategy = require('passport-apple').Strategy;
const { User, Team } = require('../models');
const logger = require('../utils/logger');

// Only configure OAuth strategies if environment variables are set
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  logger.info('✅ Google OAuth configured');
} else {
  logger.info('⚠️  Google OAuth not configured - set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
}

if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID) {
  logger.info('✅ Apple OAuth configured');
} else {
  logger.info('⚠️  Apple OAuth not configured - set APPLE_CLIENT_ID, APPLE_TEAM_ID, and APPLE_KEY_ID');
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  // Google OAuth Strategy
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
    scope: ['profile', 'email']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
    // Check if user already exists
      let user = await User.findOne({
        where: {
          oauth_provider: 'google',
          oauth_id: profile.id
        }
      });

      if (user) {
      // Update last login
        await user.update({ last_login: new Date() });
        return done(null, user);
      }

      // Check if user exists with same email but different provider
      const existingUser = await User.findOne({
        where: { email: profile.emails[0].value }
      });

      if (existingUser) {
      // Link OAuth account to existing user
        await existingUser.update({
          oauth_provider: 'google',
          oauth_id: profile.id,
          avatar_url: profile.photos[0]?.value,
          last_login: new Date()
        });
        return done(null, existingUser);
      }

      // Get team from environment or default to first team
      let team;
      if (process.env.DEFAULT_TEAM_ID) {
        team = await Team.findByPk(process.env.DEFAULT_TEAM_ID);
      } else {
        team = await Team.findOne({ order: [['id', 'ASC']] });
      }

      if (!team) {
        return done(new Error('No team configured for registration'));
      }

      // Create new user
      user = await User.create({
        email: profile.emails[0].value,
        first_name: profile.name.givenName || profile.displayName.split(' ')[0],
        last_name: profile.name.familyName || profile.displayName.split(' ').slice(1).join(' ') || 'User',
        oauth_provider: 'google',
        oauth_id: profile.id,
        avatar_url: profile.photos[0]?.value,
        role: 'assistant_coach', // Default role
        team_id: team.id,
        last_login: new Date()
      });

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }));
}

if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID) {
  // Apple OAuth Strategy
  passport.use(new AppleStrategy({
    clientID: process.env.APPLE_CLIENT_ID,
    teamID: process.env.APPLE_TEAM_ID,
    keyID: process.env.APPLE_KEY_ID,
    privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH,
    callbackURL: process.env.APPLE_CALLBACK_URL || '/api/auth/apple/callback',
    passReqToCallback: true
  }, async (req, accessToken, refreshToken, idToken, profile, done) => {
    try {
    // Apple doesn't provide email in profile, so we need to get it from the request
      const email = req.body?.user?.email || profile.email;
      const appleId = profile.id;

      if (!email) {
        return done(new Error('Email is required for Apple OAuth'));
      }

      // Check if user already exists
      let user = await User.findOne({
        where: {
          oauth_provider: 'apple',
          oauth_id: appleId
        }
      });

      if (user) {
      // Update last login
        await user.update({ last_login: new Date() });
        return done(null, user);
      }

      // Check if user exists with same email but different provider
      const existingUser = await User.findOne({
        where: { email }
      });

      if (existingUser) {
      // Link OAuth account to existing user
        await existingUser.update({
          oauth_provider: 'apple',
          oauth_id: appleId,
          last_login: new Date()
        });
        return done(null, existingUser);
      }

      // Get team from environment or default to first team
      let team;
      if (process.env.DEFAULT_TEAM_ID) {
        team = await Team.findByPk(process.env.DEFAULT_TEAM_ID);
      } else {
        team = await Team.findOne({ order: [['id', 'ASC']] });
      }

      if (!team) {
        return done(new Error('No team configured for registration'));
      }

      // Create new user
      user = await User.create({
        email,
        first_name: profile.name?.firstName || 'Apple',
        last_name: profile.name?.lastName || 'User',
        oauth_provider: 'apple',
        oauth_id: appleId,
        role: 'assistant_coach', // Default role
        team_id: team.id,
        last_login: new Date()
      });

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }));
}

// Serialize user for the session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from the session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

module.exports = passport;
