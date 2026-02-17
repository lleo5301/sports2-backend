const { Sequelize } = require("sequelize");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "postgres",
    logging: false,
  },
);

async function resetPassword() {
  try {
    await sequelize.authenticate();
    console.log("Connection has been established successfully.");

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("password", salt); // Set password to 'password'

    const [results, metadata] = await sequelize.query(
      "UPDATE users SET password = :password WHERE email = :email RETURNING id, email",
      {
        replacements: { password: hashedPassword, email: "admin@sports2.com" },
        type: Sequelize.QueryTypes.UPDATE,
      },
    );

    if (results && results.length > 0) {
      console.log(`Password updated for user: ${results[0].email}`);
    } else {
      // If update failed, try creating the user
      console.log("User not found, creating admin user...");
      const adminUser = {
        email: "admin@sports2.com",
        password: hashedPassword,
        oauth_provider: "local",
        first_name: "System",
        last_name: "Admin",
        role: "super_admin",
        phone: "+1-555-0000",
        is_active: true,
        team_id: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      await sequelize.query(
        `INSERT INTO users (email, password, oauth_provider, first_name, last_name, role, phone, is_active, team_id, created_at, updated_at)
             VALUES (:email, :password, :oauth_provider, :first_name, :last_name, :role, :phone, :is_active, :team_id, :created_at, :updated_at)`,
        {
          replacements: adminUser,
          type: Sequelize.QueryTypes.INSERT,
        },
      );
      console.log("Admin user created successfully.");
    }
  } catch (error) {
    console.error("Unable to connect to the database:", error);
  } finally {
    await sequelize.close();
  }
}

resetPassword();
