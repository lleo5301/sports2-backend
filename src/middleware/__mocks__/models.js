module.exports = {
  User: {
    findByPk: jest.fn()
  },
  UserPermission: {
    findOne: jest.fn(),
    findAll: jest.fn()
  }
};
