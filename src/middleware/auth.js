const jwt = require('jsonwebtoken');
const { User } = require('../models');
const tokenBlacklistService = require('../services/tokenBlacklistService');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if token is blacklisted
      if (decoded.jti) {
        // Convert iat (issued at) timestamp to Date object for blacklist check
        const tokenIssuedAt = decoded.iat ? new Date(decoded.iat * 1000) : null;
        const isBlacklisted = await tokenBlacklistService.isBlacklisted(
          decoded.jti,
          decoded.id,
          tokenIssuedAt
        );

        if (isBlacklisted) {
          return res.status(401).json({ success: false, error: 'Token has been revoked' });
        }
      }

      // Get user from token
      req.user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });

      if (!req.user) {
        return res.status(401).json({ success: false, error: 'User not found' });
      }

      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({ success: false, error: 'Not authorized' });
    }
  } else {
    return res.status(401).json({ success: false, error: 'Not authorized, no token' });
  }
};

// Middleware to check if user is head coach
const isHeadCoach = (req, res, next) => {
  if (req.user && req.user.role === 'head_coach') {
    next();
  } else {
    res.status(403).json({ success: false, error: 'Access denied. Head coach privileges required.' });
  }
};

// Middleware to check if user belongs to the same team
const isSameTeam = (req, res, next) => {
  if (req.user && req.user.team_id === req.params.teamId) {
    next();
  } else {
    res.status(403).json({ success: false, error: 'Access denied. Team membership required.' });
  }
};

module.exports = { protect, isHeadCoach, isSameTeam }; 