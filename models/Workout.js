const { query, callProcedure } = require('../config/database');

class Workout {
  constructor(workoutData) {
    this.workoutId = workoutData.WorkoutID;
    this.userId = workoutData.UserID;
    this.workoutDate = workoutData.Workout_Date;
    this.workoutName = workoutData.Workout_Name;
    this.totalDuration = workoutData.Total_Duration;
    this.totalCaloriesBurned = workoutData.Total_Calories_Burned;
    this.averageHeartRate = workoutData.Average_Heart_Rate;
    this.maxHeartRate = workoutData.Max_Heart_Rate;
    this.workoutIntensity = workoutData.Workout_Intensity;
    this.notes = workoutData.Notes;
    this.createdDate = workoutData.Created_Date;
  }

  // Static method to find workout by ID
  static async findById(workoutId, userId = null) {
    try {
      let sql = 'SELECT * FROM Workouts WHERE WorkoutID = ?';
      let params = [workoutId];
      
      if (userId) {
        sql += ' AND UserID = ?';
        params.push(userId);
      }

      const [workouts] = await query(sql, params);
      
      if (workouts.length === 0) {
        return null;
      }
      
      return new Workout(workouts[0]);
    } catch (error) {
      console.error('Workout findById error:', error);
      throw error;
    }
  }

  // Static method to find workouts by user and date
  static async findByUserAndDate(userId, date) {
    try {
      const [workouts] = await query(`
        SELECT * FROM Workouts 
        WHERE UserID = ? AND Workout_Date = ?
        ORDER BY Created_Date DESC
      `, [userId, date]);
      
      return workouts.map(workoutData => new Workout(workoutData));
    } catch (error) {
      console.error('Workout findByUserAndDate error:', error);
      throw error;
    }
  }

  // Static method to create new workout
  static async create(workoutData) {
    try {
      const {
        userId, workoutDate, workoutName, workoutIntensity, notes
      } = workoutData;

      const [result] = await query(`
        INSERT INTO Workouts (UserID, Workout_Date, Workout_Name, Workout_Intensity, Notes)
        VALUES (?, ?, ?, ?, ?)
      `, [userId, workoutDate, workoutName, workoutIntensity || 'Moderate', notes]);

      return await Workout.findById(result.insertId);
    } catch (error) {
      console.error('Workout create error:', error);
      throw error;
    }
  }

  // Instance method to add exercise
  async addExercise(exerciseData) {
    try {
      const {
        exerciseId, sets, reps, weight, duration, distance,
        restTime, heartRateAvg, perceivedExertion, exerciseNotes
      } = exerciseData;

      // Get exercise order
      const [orderResult] = await query(
        'SELECT COALESCE(MAX(Exercise_Order), 0) + 1 as next_order FROM Workout_Exercises WHERE WorkoutID = ?',
        [this.workoutId]
      );

      const exerciseOrder = orderResult[0].next_order;

      // Calculate calories burned if duration is provided
      let caloriesBurned = 0;
      if (duration) {
        const [exerciseInfo] = await query(
          'SELECT Calories_Per_Minute FROM Exercises WHERE ExerciseID = ?',
          [exerciseId]
        );

        if (exerciseInfo.length > 0 && exerciseInfo[0].Calories_Per_Minute) {
          // Get user weight for calculation
          const [userProfile] = await query(
            'SELECT Current_Weight FROM User_Profiles WHERE UserID = ?',
            [this.userId]
          );

          const weight = userProfile.length > 0 ? userProfile[0].Current_Weight : 70;
          const weightFactor = weight / 70; // 70kg baseline
          caloriesBurned = exerciseInfo[0].Calories_Per_Minute * duration * weightFactor;
        }
      }

      // Insert workout exercise
      await query(`
        INSERT INTO Workout_Exercises (
          WorkoutID, ExerciseID, Exercise_Order, Sets, Reps, Weight,
          Duration, Distance, Rest_Time, Calories_Burned,
          Heart_Rate_Avg, Perceived_Exertion, Notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        this.workoutId, exerciseId, exerciseOrder, sets, reps, weight,
        duration, distance, restTime, caloriesBurned,
        heartRateAvg, perceivedExertion, exerciseNotes
      ]);

      // Update workout totals
      await this.updateTotals();

      return true;
    } catch (error) {
      console.error('Add exercise error:', error);
      throw error;
    }
  }

  // Instance method to update workout totals
  async updateTotals() {
    try {
      // Try stored procedure first
      try {
        await callProcedure('UpdateWorkoutTotals', [this.workoutId]);
      } catch (procError) {
        // Fallback to manual calculation
        const [totals] = await query(`
          SELECT 
            COALESCE(SUM(we.Duration), 0) as total_duration,
            COALESCE(SUM(we.Calories_Burned), 0) as total_calories,
            COALESCE(AVG(we.Heart_Rate_Avg), 0) as avg_heart_rate,
            COALESCE(MAX(we.Heart_Rate_Avg), 0) as max_heart_rate
          FROM Workout_Exercises we 
          WHERE we.WorkoutID = ?
        `, [this.workoutId]);

        if (totals.length > 0) {
          await query(`
            UPDATE Workouts 
            SET Total_Duration = ?, Total_Calories_Burned = ?, 
                Average_Heart_Rate = ?, Max_Heart_Rate = ?
            WHERE WorkoutID = ?
          `, [
            totals[0].total_duration, totals[0].total_calories,
            totals[0].avg_heart_rate, totals[0].max_heart_rate, this.workoutId
          ]);
        }
      }

      // Refresh workout data
      const updatedWorkout = await Workout.findById(this.workoutId);
      if (updatedWorkout) {
        Object.assign(this, updatedWorkout);
      }

      return true;
    } catch (error) {
      console.error('Update totals error:', error);
      throw error;
    }
  }

  // Instance method to get workout exercises
  async getExercises() {
    try {
      const [exercises] = await query(`
        SELECT 
          we.*, e.Exercise_Name, e.Category, e.Equipment_Needed,
          e.Muscle_Groups, e.Difficulty_Level, e.Instructions
        FROM Workout_Exercises we
        JOIN Exercises e ON we.ExerciseID = e.ExerciseID
        WHERE we.WorkoutID = ?
        ORDER BY we.Exercise_Order ASC
      `, [this.workoutId]);

      return exercises;
    } catch (error) {
      console.error('Get workout exercises error:', error);
      throw error;
    }
  }

  // Static method to get workout statistics for user
  static async getStatistics(userId, days = 30) {
    try {
      const [stats] = await query(`
        SELECT 
          COUNT(w.WorkoutID) as total_workouts,
          COALESCE(SUM(w.Total_Duration), 0) as total_minutes,
          COALESCE(SUM(w.Total_Calories_Burned), 0) as total_calories,
          COALESCE(AVG(w.Total_Duration), 0) as avg_duration,
          COUNT(DISTINCT w.Workout_Date) as active_days
        FROM Workouts w
        WHERE w.UserID = ? 
        AND w.Workout_Date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      `, [userId, days]);

      return stats.length > 0 ? stats[0] : {
        total_workouts: 0,
        total_minutes: 0,
        total_calories: 0,
        avg_duration: 0,
        active_days: 0
      };
    } catch (error) {
      console.error('Get workout statistics error:', error);
      throw error;
    }
  }
}

module.exports = Workout;
