const express = require('express');
const bcrypt = require('bcryptjs');
const { query, callProcedure } = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ==============================================
// GET USER PROFILE
// ==============================================
router.get('/profile', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [userProfile] = await query(`
      SELECT 
        u.UserID, u.Username, u.Email, u.First_Name, u.Last_Name, 
        u.Date_Of_Birth, u.Gender, u.Phone, u.Registration_Date,
        up.Current_Weight, up.Height, up.Target_Weight, up.Activity_Level,
        up.BMR, up.Body_Fat_Percentage, up.Fitness_Level, up.Health_Conditions,
        up.Profile_Picture,
        pr.Measurement_Units, pr.Privacy_Level, pr.Theme_Preference,
        pr.Daily_Calorie_Goal, pr.Daily_Protein_Goal, pr.Daily_Carb_Goal, pr.Daily_Fat_Goal
      FROM Users u
      LEFT JOIN User_Profiles up ON u.UserID = up.UserID
      LEFT JOIN User_Preferences pr ON u.UserID = pr.UserID
      WHERE u.UserID = ?
    `, [userId]);

    if (userProfile.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User profile does not exist'
      });
    }

    // Calculate BMI if height and weight are available
    let bmi = null;
    const profile = userProfile[0];
    if (profile.Current_Weight && profile.Height) {
      const heightInMeters = profile.Height / 100;
      bmi = (profile.Current_Weight / (heightInMeters * heightInMeters)).toFixed(1);
    }

    res.json({
      success: true,
      data: {
        ...profile,
        BMI: bmi
      }
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      error: 'Failed to fetch user profile',
      message: error.message
    });
  }
});

// ==============================================
// UPDATE USER PROFILE
// ==============================================
router.put('/profile', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      firstName, lastName, phone, currentWeight, height, targetWeight,
      activityLevel, bodyFatPercentage, fitnessLevel, healthConditions,
      measurementUnits, privacyLevel, themePreference, dailyCalorieGoal,
      dailyProteinGoal, dailyCarbGoal, dailyFatGoal
    } = req.body;

    // Update user basic info
    if (firstName || lastName || phone) {
      await query(`
        UPDATE Users 
        SET First_Name = COALESCE(?, First_Name),
            Last_Name = COALESCE(?, Last_Name),
            Phone = COALESCE(?, Phone)
        WHERE UserID = ?
      `, [firstName, lastName, phone, userId]);
    }

    // Update user profile
    if (currentWeight || height || targetWeight || activityLevel || bodyFatPercentage || fitnessLevel || healthConditions) {
      await query(`
        UPDATE User_Profiles 
        SET Current_Weight = COALESCE(?, Current_Weight),
            Height = COALESCE(?, Height),
            Target_Weight = COALESCE(?, Target_Weight),
            Activity_Level = COALESCE(?, Activity_Level),
            Body_Fat_Percentage = COALESCE(?, Body_Fat_Percentage),
            Fitness_Level = COALESCE(?, Fitness_Level),
            Health_Conditions = COALESCE(?, Health_Conditions),
            Updated_Date = CURRENT_TIMESTAMP
        WHERE UserID = ?
      `, [currentWeight, height, targetWeight, activityLevel, bodyFatPercentage, fitnessLevel, healthConditions, userId]);
    }

    // Update user preferences
    if (measurementUnits || privacyLevel || themePreference || dailyCalorieGoal || dailyProteinGoal || dailyCarbGoal || dailyFatGoal) {
      await query(`
        UPDATE User_Preferences 
        SET Measurement_Units = COALESCE(?, Measurement_Units),
            Privacy_Level = COALESCE(?, Privacy_Level),
            Theme_Preference = COALESCE(?, Theme_Preference),
            Daily_Calorie_Goal = COALESCE(?, Daily_Calorie_Goal),
            Daily_Protein_Goal = COALESCE(?, Daily_Protein_Goal),
            Daily_Carb_Goal = COALESCE(?, Daily_Carb_Goal),
            Daily_Fat_Goal = COALESCE(?, Daily_Fat_Goal),
            Updated_Date = CURRENT_TIMESTAMP
        WHERE UserID = ?
      `, [measurementUnits, privacyLevel, themePreference, dailyCalorieGoal, dailyProteinGoal, dailyCarbGoal, dailyFatGoal, userId]);
    }

    // Recalculate BMR if weight or height changed
    if (currentWeight || height) {
      try {
        await callProcedure('CalculateBMR', [userId]);
      } catch (procError) {
        console.warn('BMR calculation procedure not available');
      }
    }

    // Log activity
    await query(
      'INSERT INTO Activity_Logs (UserID, Activity_Type, Description, Status) VALUES (?, ?, ?, ?)',
      [userId, 'Profile_Update', 'User profile updated successfully', 'Success']
    );

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: error.message
    });
  }
});

// ==============================================
// CHANGE PASSWORD
// ==============================================
router.put('/password', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'New password must be at least 6 characters long'
      });
    }

    // Get current password hash
    const [user] = await query(
      'SELECT Password_Hash FROM Users WHERE UserID = ?',
      [userId]
    );

    if (user.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user[0].Password_Hash);

    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await query(
      'UPDATE Users SET Password_Hash = ? WHERE UserID = ?',
      [hashedNewPassword, userId]
    );

    // Log activity
    await query(
      'INSERT INTO Activity_Logs (UserID, Activity_Type, Description, Status) VALUES (?, ?, ?, ?)',
      [userId, 'Password_Change', 'Password changed successfully', 'Success']
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Failed to change password',
      message: error.message
    });
  }
});

// ==============================================
// GET USER DASHBOARD STATS
// ==============================================
router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];

    // Get today's stats
    const [todayStats] = await query(`
      SELECT 
        COALESCE(SUM(m.Total_Calories), 0) AS today_calories,
        COALESCE(SUM(m.Total_Protein), 0) AS today_protein,
        COALESCE(SUM(m.Total_Carbs), 0) AS today_carbs,
        COALESCE(SUM(m.Total_Fat), 0) AS today_fat,
        COUNT(DISTINCT m.MealID) AS meals_logged
      FROM Meals m
      WHERE m.UserID = ? AND m.Meal_Date = ?
    `, [userId, today]);

    // Get workout stats for today
    const [workoutStats] = await query(`
      SELECT 
        COALESCE(SUM(w.Total_Calories_Burned), 0) AS calories_burned,
        COUNT(w.WorkoutID) AS workouts_completed,
        COALESCE(SUM(w.Total_Duration), 0) AS total_exercise_minutes
      FROM Workouts w
      WHERE w.UserID = ? AND w.Workout_Date = ?
    `, [userId, today]);

    // Get active goals count
    const [goalsStats] = await query(`
      SELECT 
        COUNT(*) AS active_goals,
        COUNT(CASE WHEN Status = 'Completed' THEN 1 END) AS completed_goals
      FROM Goals
      WHERE UserID = ?
    `, [userId]);

    // Get streak data (days with logged meals)
    const [streakData] = await query(`
      SELECT 
        COUNT(DISTINCT Meal_Date) AS days_logged,
        MAX(Meal_Date) AS last_logged_date
      FROM Meals
      WHERE UserID = ? AND Meal_Date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `, [userId]);

    res.json({
      success: true,
      data: {
        today: {
          ...todayStats[0],
          ...workoutStats[0]
        },
        goals: goalsStats[0],
        streak: streakData[0]
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard stats',
      message: error.message
    });
  }
});

module.exports = router;
