const express = require('express');
const { query, callProcedure } = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ==============================================
// GET ALL WORKOUTS FOR USER
// ==============================================
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT 
        w.WorkoutID, w.Workout_Date, w.Workout_Name, w.Total_Duration,
        w.Total_Calories_Burned, w.Average_Heart_Rate, w.Workout_Intensity,
        w.Notes, w.Created_Date,
        COUNT(we.WorkoutExerciseID) as exercise_count
      FROM Workouts w
      LEFT JOIN Workout_Exercises we ON w.WorkoutID = we.WorkoutID
      WHERE w.UserID = ?
    `;
    
    let params = [userId];
    
    if (date) {
      sql += ' AND w.Workout_Date = ?';
      params.push(date);
    }
    
    sql += ' GROUP BY w.WorkoutID ORDER BY w.Workout_Date DESC, w.Created_Date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [workouts] = await query(sql, params);

    res.json({
      success: true,
      data: workouts,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: workouts.length
      }
    });

  } catch (error) {
    console.error('Get workouts error:', error);
    res.status(500).json({
      error: 'Failed to fetch workouts',
      message: error.message
    });
  }
});

// ==============================================
// GET WORKOUT BY ID WITH EXERCISES
// ==============================================
router.get('/:workoutId', auth, async (req, res) => {
  try {
    const { workoutId } = req.params;
    const userId = req.user.userId;

    // Get workout details
    const [workoutDetails] = await query(`
      SELECT 
        w.WorkoutID, w.Workout_Date, w.Workout_Name, w.Total_Duration,
        w.Total_Calories_Burned, w.Average_Heart_Rate, w.Max_Heart_Rate,
        w.Workout_Intensity, w.Notes, w.Created_Date
      FROM Workouts w
      WHERE w.WorkoutID = ? AND w.UserID = ?
    `, [workoutId, userId]);

    if (workoutDetails.length === 0) {
      return res.status(404).json({
        error: 'Workout not found',
        message: 'Workout does not exist or access denied'
      });
    }

    // Get workout exercises
    const [exercises] = await query(`
      SELECT 
        we.WorkoutExerciseID, we.Exercise_Order, we.Sets, we.Reps,
        we.Weight, we.Duration, we.Distance, we.Rest_Time,
        we.Calories_Burned, we.Heart_Rate_Avg, we.Perceived_Exertion,
        we.Notes as exercise_notes,
        e.Exercise_Name, e.Category, e.Equipment_Needed, e.Muscle_Groups,
        e.Difficulty_Level, e.Instructions
      FROM Workout_Exercises we
      JOIN Exercises e ON we.ExerciseID = e.ExerciseID
      WHERE we.WorkoutID = ?
      ORDER BY we.Exercise_Order ASC
    `, [workoutId]);

    res.json({
      success: true,
      data: {
        ...workoutDetails[0],
        exercises: exercises
      }
    });

  } catch (error) {
    console.error('Get workout details error:', error);
    res.status(500).json({
      error: 'Failed to fetch workout details',
      message: error.message
    });
  }
});

// ==============================================
// ADD NEW WORKOUT
// ==============================================
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { 
      workoutDate, workoutName, workoutIntensity, notes, exercises 
    } = req.body;

    // Validate required fields
    if (!workoutDate) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Workout date is required'
      });
    }

    // Insert workout
    const [workoutResult] = await query(`
      INSERT INTO Workouts (UserID, Workout_Date, Workout_Name, Workout_Intensity, Notes) 
      VALUES (?, ?, ?, ?, ?)
    `, [userId, workoutDate, workoutName, workoutIntensity || 'Moderate', notes]);

    const workoutId = workoutResult.insertId;

    // Insert workout exercises if provided
    if (exercises && exercises.length > 0) {
      for (let i = 0; i < exercises.length; i++) {
        const exercise = exercises[i];
        const {
          exerciseId, sets, reps, weight, duration, distance,
          restTime, caloriesBurned, heartRateAvg, perceivedExertion, exerciseNotes
        } = exercise;

        if (!exerciseId) {
          continue; // Skip invalid exercises
        }

        // Calculate calories burned if not provided
        let calculatedCalories = caloriesBurned;
        if (!calculatedCalories && duration) {
          // Get exercise calories per minute
          const [exerciseData] = await query(
            'SELECT Calories_Per_Minute FROM Exercises WHERE ExerciseID = ?',
            [exerciseId]
          );

          if (exerciseData.length > 0 && exerciseData[0].Calories_Per_Minute) {
            // Get user weight for calculation
            const [userWeight] = await query(
              'SELECT Current_Weight FROM User_Profiles WHERE UserID = ?',
              [userId]
            );

            const weightFactor = userWeight.length > 0 ? (userWeight[0].Current_Weight / 70) : 1;
            calculatedCalories = exerciseData[0].Calories_Per_Minute * duration * weightFactor;
          }
        }

        await query(`
          INSERT INTO Workout_Exercises (
            WorkoutID, ExerciseID, Exercise_Order, Sets, Reps, Weight,
            Duration, Distance, Rest_Time, Calories_Burned,
            Heart_Rate_Avg, Perceived_Exertion, Notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          workoutId, exerciseId, i + 1, sets, reps, weight,
          duration, distance, restTime, calculatedCalories,
          heartRateAvg, perceivedExertion, exerciseNotes
        ]);
      }

      // Update workout totals using stored procedure
      try {
        await callProcedure('UpdateWorkoutTotals', [workoutId]);
      } catch (procError) {
        console.warn('Stored procedure not available, calculating manually');
        
        // Manual calculation as fallback
        const [totals] = await query(`
          SELECT 
            COALESCE(SUM(we.Duration), 0) as total_duration,
            COALESCE(SUM(we.Calories_Burned), 0) as total_calories,
            COALESCE(AVG(we.Heart_Rate_Avg), 0) as avg_heart_rate,
            COALESCE(MAX(we.Heart_Rate_Avg), 0) as max_heart_rate
          FROM Workout_Exercises we 
          WHERE we.WorkoutID = ?
        `, [workoutId]);

        if (totals.length > 0) {
          await query(`
            UPDATE Workouts SET 
            Total_Duration = ?, Total_Calories_Burned = ?, 
            Average_Heart_Rate = ?, Max_Heart_Rate = ?
            WHERE WorkoutID = ?
          `, [
            totals[0].total_duration, totals[0].total_calories,
            totals[0].avg_heart_rate, totals[0].max_heart_rate, workoutId
          ]);
        }
      }
    }

    // Log activity
    await query(
      'INSERT INTO Activity_Logs (UserID, Activity_Type, Description, Status) VALUES (?, ?, ?, ?)',
      [userId, 'Workout_Log', `Added workout: ${workoutName || 'Unnamed workout'}`, 'Success']
    );

    res.status(201).json({
      success: true,
      message: 'Workout added successfully',
      data: { workoutId }
    });

  } catch (error) {
    console.error('Add workout error:', error);
    res.status(500).json({
      error: 'Failed to add workout',
      message: error.message
    });
  }
});

// ==============================================
// SEARCH EXERCISES
// ==============================================
router.get('/exercises/search', async (req, res) => {
  try {
    const { q, category, difficulty, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Search query is required'
      });
    }

    let sql = `
      SELECT 
        ExerciseID, Exercise_Name, Category, Equipment_Needed,
        Muscle_Groups, Difficulty_Level, Instructions,
        Calories_Per_Minute, Exercise_Type, Verified
      FROM Exercises 
      WHERE (Exercise_Name LIKE ? OR Instructions LIKE ? OR Muscle_Groups LIKE ?)
    `;
    
    let params = [`%${q}%`, `%${q}%`, `%${q}%`];

    if (category) {
      sql += ' AND Category = ?';
      params.push(category);
    }

    if (difficulty) {
      sql += ' AND Difficulty_Level = ?';
      params.push(difficulty);
    }

    sql += ' ORDER BY Verified DESC, Exercise_Name ASC LIMIT ?';
    params.push(parseInt(limit));

    const [exercises] = await query(sql, params);

    res.json({
      success: true,
      data: exercises,
      query: q,
      filters: { category, difficulty },
      total: exercises.length
    });

  } catch (error) {
    console.error('Exercise search error:', error);
    res.status(500).json({
      error: 'Failed to search exercises',
      message: error.message
    });
  }
});

// ==============================================
// GET WORKOUT STATISTICS
// ==============================================
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { period = '30' } = req.query; // days

    const [stats] = await query(`
      SELECT 
        COUNT(w.WorkoutID) as total_workouts,
        COALESCE(SUM(w.Total_Duration), 0) as total_minutes,
        COALESCE(SUM(w.Total_Calories_Burned), 0) as total_calories_burned,
        COALESCE(AVG(w.Total_Duration), 0) as avg_workout_duration,
        COUNT(DISTINCT w.Workout_Date) as active_days,
        COUNT(DISTINCT DATE_FORMAT(w.Workout_Date, '%Y-%m')) as active_months
      FROM Workouts w
      WHERE w.UserID = ? 
      AND w.Workout_Date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `, [userId, parseInt(period)]);

    // Get favorite exercises
    const [favoriteExercises] = await query(`
      SELECT 
        e.Exercise_Name,
        COUNT(*) as usage_count,
        COALESCE(AVG(we.Calories_Burned), 0) as avg_calories
      FROM Workout_Exercises we
      JOIN Exercises e ON we.ExerciseID = e.ExerciseID
      JOIN Workouts w ON we.WorkoutID = w.WorkoutID
      WHERE w.UserID = ? 
      AND w.Workout_Date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY e.ExerciseID, e.Exercise_Name
      ORDER BY usage_count DESC
      LIMIT 5
    `, [userId, parseInt(period)]);

    res.json({
      success: true,
      data: {
        summary: stats[0],
        favorite_exercises: favoriteExercises,
        period_days: parseInt(period)
      }
    });

  } catch (error) {
    console.error('Get workout stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch workout statistics',
      message: error.message
    });
  }
});

module.exports = router;
