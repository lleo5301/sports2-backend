const jwt = require('jsonwebtoken');
const { protect, isHeadCoach, isSameTeam } = require('../auth');
const { User } = require('../../models');

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
    jest.spyOn(jwt, 'verify').mockImplementation(() => {
      throw new Error('bad');
    });
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
