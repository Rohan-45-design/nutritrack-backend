const { query } = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  constructor(userData) {
    this.userId = userData.UserID;
    this.username = userData.Username;
    this.email = userData.Email;
    this.firstName = userData.First_Name;
    this.lastName = userData.Last_Name;
    this.dateOfBirth = userData.Date_Of_Birth;
    this.gender = userData.Gender;
    this.phone = userData.Phone;
    this.registrationDate = userData.Registration_Date;
    this.lastLogin = userData.Last_Login;
    this.accountStatus = userData.Account_Status;
  }

  // Static method to find user by ID
  static async findById(userId) {
    try {
      const [users] = await query(
        'SELECT * FROM Users WHERE UserID = ? AND Account_Status = ?',
        [userId, 'Active']
      );
      
      if (users.length === 0) {
        return null;
      }
      
      return new User(users[0]);
    } catch (error) {
      console.error('User findById error:', error);
      throw error;
    }
  }

  // Static method to find user by email
  static async findByEmail(email) {
    try {
      const [users] = await query(
        'SELECT * FROM Users WHERE Email = ?',
        [email]
      );
      
      if (users.length === 0) {
        return null;
      }
      
      return new User(users[0]);
    } catch (error) {
      console.error('User findByEmail error:', error);
      throw error;
    }
  }

  // Static method to create new user
  static async create(userData) {
    try {
      const {
        username, email, password, firstName, lastName,
        dateOfBirth, gender, phone
      } = userData;

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Insert user
      const [result] = await query(`
        INSERT INTO Users (Username, Email, Password_Hash, First_Name, Last_Name, Date_Of_Birth, Gender, Phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [username, email, passwordHash, firstName, lastName, dateOfBirth, gender, phone]);

      const userId = result.insertId;

      // Create default profile
      await query(`
        INSERT INTO User_Profiles (UserID, Activity_Level, Fitness_Level)
        VALUES (?, ?, ?)
      `, [userId, 'Moderately Active', 'Beginner']);

      // Create default preferences
      await query(`
        INSERT INTO User_Preferences (UserID, Measurement_Units, Privacy_Level, Theme_Preference)
        VALUES (?, ?, ?, ?)
      `, [userId, 'Metric', 'Private', 'Auto']);

      return await User.findById(userId);
    } catch (error) {
      console.error('User create error:', error);
      throw error;
    }
  }

  // Instance method to verify password
  async verifyPassword(password) {
    try {
      const [user] = await query(
        'SELECT Password_Hash FROM Users WHERE UserID = ?',
        [this.userId]
      );
      
      if (user.length === 0) {
        return false;
      }
      
      return await bcrypt.compare(password, user[0].Password_Hash);
    } catch (error) {
      console.error('Password verification error:', error);
      throw error;
    }
  }

  // Instance method to update last login
  async updateLastLogin() {
    try {
      await query(
        'UPDATE Users SET Last_Login = CURRENT_TIMESTAMP WHERE UserID = ?',
        [this.userId]
      );
    } catch (error) {
      console.error('Update last login error:', error);
      throw error;
    }
  }

  // Get user profile with additional data
  async getFullProfile() {
    try {
      const [profile] = await query(`
        SELECT 
          u.*, 
          up.Current_Weight, up.Height, up.Target_Weight, up.Activity_Level,
          up.BMR, up.Body_Fat_Percentage, up.Fitness_Level, up.Health_Conditions,
          pr.Measurement_Units, pr.Privacy_Level, pr.Theme_Preference,
          pr.Daily_Calorie_Goal, pr.Daily_Protein_Goal
        FROM Users u
        LEFT JOIN User_Profiles up ON u.UserID = up.UserID
        LEFT JOIN User_Preferences pr ON u.UserID = pr.UserID
        WHERE u.UserID = ?
      `, [this.userId]);

      return profile.length > 0 ? profile[0] : null;
    } catch (error) {
      console.error('Get full profile error:', error);
      throw error;
    }
  }
}

module.exports = User;
