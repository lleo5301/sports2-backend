const errorHandler = require('../errorHandler');

describe('errorHandler', () => {
  const res = () => {
    const r = {};
    r.status = jest.fn(() => r);
    r.json = jest.fn(() => r);
    return r;
  };

  it('handles generic error', () => {
    const err = new Error('boom');
    const req = {};
    const response = res();
    errorHandler(err, req, response, () => {});
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalled();
  });

  it('handles sequelize validation error', () => {
    const err = new Error('validation');
    err.name = 'SequelizeValidationError';
    err.errors = [{ message: 'bad' }, { message: 'worse' }];
    const req = {};
    const response = res();
    errorHandler(err, req, response, () => {});
    expect(response.status).toHaveBeenCalledWith(400);
  });
});


