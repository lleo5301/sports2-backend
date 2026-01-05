describe('permissions middleware', () => {
  const next = jest.fn();
  const res = () => {
    const r = {};
    r.status = jest.fn(() => r);
    r.json = jest.fn(() => r);
    return r;
  };

  let checkPermission, checkAnyPermission, checkAllPermissions;
  const mockFindOne = jest.fn();
  const mockFindAll = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../models', () => ({
      UserPermission: {
        findOne: (...args) => mockFindOne(...args),
        findAll: (...args) => mockFindAll(...args)
      }
    }));
    ({ checkPermission, checkAnyPermission, checkAllPermissions } = require('../permissions'));
    jest.clearAllMocks();
  });

  it('checkPermission allows when granted and not expired', async () => {
    mockFindOne.mockResolvedValue({ is_granted: true, expires_at: null });
    const req = { user: { id: 1, team_id: 2 } };
    const response = res();
    await checkPermission('team_settings')(req, response, next);
    expect(next).toHaveBeenCalled();
  });

  it('checkPermission rejects when not found', async () => {
    mockFindOne.mockResolvedValue(null);
    const req = { user: { id: 1, team_id: 2 } };
    const response = res();
    await checkPermission('team_settings')(req, response, next);
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it('checkAnyPermission allows with any one matched', async () => {
    mockFindOne.mockResolvedValue({ is_granted: true, expires_at: null });
    const req = { user: { id: 1, team_id: 2 } };
    const response = res();
    await checkAnyPermission(['a', 'b'])(req, response, next);
    expect(next).toHaveBeenCalled();
  });

  it('checkAllPermissions requires all', async () => {
    mockFindAll.mockResolvedValue([{ permission_type: 'a' }, { permission_type: 'b' }]);
    const req = { user: { id: 1, team_id: 2 } };
    const response = res();
    await checkAllPermissions(['a', 'b'])(req, response, next);
    expect(next).toHaveBeenCalled();
  });

  it('checkAllPermissions rejects when expired', async () => {
    mockFindAll.mockResolvedValue([{ expires_at: new Date(Date.now() - 1000) }]);
    const req = { user: { id: 1, team_id: 2 } };
    const response = res();
    await checkAllPermissions(['a'])(req, response, next);
    expect(response.status).toHaveBeenCalledWith(403);
  });
});
