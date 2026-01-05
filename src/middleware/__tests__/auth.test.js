const jwt = require('jsonwebtoken');
const { protect, isHeadCoach, isSameTeam } = require('../auth');
const { User } = require('../../models');
const tokenBlacklistService = require('../../services/tokenBlacklistService');

// Mock dependencies
jest.mock('../../services/tokenBlacklistService');

describe('auth middleware', () => {
  const next = jest.fn();
  const res = () => {
    const r = {};
    r.status = jest.fn(() => r);
    r.json = jest.fn(() => r);
    return r;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects when no token is provided', async () => {
    const req = { headers: {} };
    const response = res();
    await protect(req, response, next);
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it('rejects on invalid token', async () => {
    const req = { headers: { authorization: 'Bearer bad' } };
    jest.spyOn(jwt, 'verify').mockImplementation(() => { throw new Error('bad'); });
    const response = res();
    await protect(req, response, next);
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it('calls next when user exists', async () => {
    const token = jwt.sign({ id: 123 }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };

    // Mock token verify and user lookup
    jest.spyOn(jwt, 'verify').mockReturnValue({ id: 123 });
    jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 123, role: 'assistant' });

    const response = res();
    await protect(req, response, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe(123);
  });

  describe('blacklist checks', () => {
    it('allows token without jti (backward compatibility)', async () => {
      const token = jwt.sign({ id: 123 }, process.env.JWT_SECRET);
      const req = { headers: { authorization: `Bearer ${token}` } };

      // Mock token verify and user lookup
      jest.spyOn(jwt, 'verify').mockReturnValue({ id: 123 });
      jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 123, role: 'assistant' });

      const response = res();
      await protect(req, response, next);
      expect(next).toHaveBeenCalled();
      expect(tokenBlacklistService.isBlacklisted).not.toHaveBeenCalled();
    });

    it('rejects blacklisted token with jti', async () => {
      const token = jwt.sign({ id: 123, jti: 'test-jti-123' }, process.env.JWT_SECRET);
      const req = { headers: { authorization: `Bearer ${token}` } };

      // Mock token verify and blacklist check
      jest.spyOn(jwt, 'verify').mockReturnValue({
        id: 123,
        jti: 'test-jti-123',
        iat: Math.floor(Date.now() / 1000)
      });
      tokenBlacklistService.isBlacklisted.mockResolvedValue(true);

      const response = res();
      await protect(req, response, next);

      expect(tokenBlacklistService.isBlacklisted).toHaveBeenCalledWith(
        'test-jti-123',
        123,
        expect.any(Date)
      );
      expect(response.status).toHaveBeenCalledWith(401);
      expect(response.json).toHaveBeenCalledWith({
        success: false,
        error: 'Token has been revoked'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('allows non-blacklisted token with jti', async () => {
      const token = jwt.sign({ id: 123, jti: 'test-jti-456' }, process.env.JWT_SECRET);
      const req = { headers: { authorization: `Bearer ${token}` } };

      // Mock token verify, blacklist check, and user lookup
      jest.spyOn(jwt, 'verify').mockReturnValue({
        id: 123,
        jti: 'test-jti-456',
        iat: Math.floor(Date.now() / 1000)
      });
      tokenBlacklistService.isBlacklisted.mockResolvedValue(false);
      jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 123, role: 'assistant' });

      const response = res();
      await protect(req, response, next);

      expect(tokenBlacklistService.isBlacklisted).toHaveBeenCalledWith(
        'test-jti-456',
        123,
        expect.any(Date)
      );
      expect(next).toHaveBeenCalled();
      expect(req.user.id).toBe(123);
    });

    it('converts iat timestamp to Date object for blacklist check', async () => {
      const iatTimestamp = 1704450000; // Unix timestamp
      const token = jwt.sign({ id: 123, jti: 'test-jti-789' }, process.env.JWT_SECRET);
      const req = { headers: { authorization: `Bearer ${token}` } };

      // Mock token verify with specific iat
      jest.spyOn(jwt, 'verify').mockReturnValue({
        id: 123,
        jti: 'test-jti-789',
        iat: iatTimestamp
      });
      tokenBlacklistService.isBlacklisted.mockResolvedValue(false);
      jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 123, role: 'assistant' });

      const response = res();
      await protect(req, response, next);

      expect(tokenBlacklistService.isBlacklisted).toHaveBeenCalledWith(
        'test-jti-789',
        123,
        new Date(iatTimestamp * 1000)
      );
      expect(next).toHaveBeenCalled();
    });

    it('handles token with jti but no iat', async () => {
      const token = jwt.sign({ id: 123, jti: 'test-jti-no-iat' }, process.env.JWT_SECRET);
      const req = { headers: { authorization: `Bearer ${token}` } };

      // Mock token verify without iat
      jest.spyOn(jwt, 'verify').mockReturnValue({
        id: 123,
        jti: 'test-jti-no-iat'
      });
      tokenBlacklistService.isBlacklisted.mockResolvedValue(false);
      jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 123, role: 'assistant' });

      const response = res();
      await protect(req, response, next);

      expect(tokenBlacklistService.isBlacklisted).toHaveBeenCalledWith(
        'test-jti-no-iat',
        123,
        null
      );
      expect(next).toHaveBeenCalled();
    });

    it('rejects token revoked via user-level blacklist', async () => {
      const token = jwt.sign({ id: 123, jti: 'test-jti-user-revoke' }, process.env.JWT_SECRET);
      const req = { headers: { authorization: `Bearer ${token}` } };

      // Mock token verify and user-level blacklist check
      jest.spyOn(jwt, 'verify').mockReturnValue({
        id: 123,
        jti: 'test-jti-user-revoke',
        iat: Math.floor(Date.now() / 1000) - 3600 // Issued 1 hour ago
      });
      tokenBlacklistService.isBlacklisted.mockResolvedValue(true); // User revoked all tokens

      const response = res();
      await protect(req, response, next);

      expect(tokenBlacklistService.isBlacklisted).toHaveBeenCalled();
      expect(response.status).toHaveBeenCalledWith(401);
      expect(response.json).toHaveBeenCalledWith({
        success: false,
        error: 'Token has been revoked'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  it('isHeadCoach allows head coach', () => {
    const req = { user: { role: 'head_coach' } };
    const response = res();
    isHeadCoach(req, response, next);
    expect(next).toHaveBeenCalled();
  });

  it('isHeadCoach rejects non-head coach', () => {
    const req = { user: { role: 'assistant' } };
    const response = res();
    isHeadCoach(req, response, next);
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it('isSameTeam allows same team', () => {
    const req = { user: { team_id: '1' }, params: { teamId: '1' } };
    const response = res();
    isSameTeam(req, response, next);
    expect(next).toHaveBeenCalled();
  });

  it('isSameTeam rejects different team', () => {
    const req = { user: { team_id: '1' }, params: { teamId: '2' } };
    const response = res();
    isSameTeam(req, response, next);
    expect(response.status).toHaveBeenCalledWith(403);
  });
});


