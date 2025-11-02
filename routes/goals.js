const express = require('express');
const { query, callProcedure } = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ==============================================
// GET ALL GOALS FOR USER
// ==============================================
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT 
        g.GoalID, g.Goal_Type, g.Goal_Title, g.Target_Value, g.Current_Value,
        g.Unit, g.Start_Date, g.Target_Date, g.Status, g.Priority, g.Category,
        g.Description, g.Notes, g.Created_Date, g.Updated_Date, g.Completed_Date,
        CASE 
          WHEN g.Target_Value > 0 THEN 
            ROUND(((g.Current_Value / g.Target_Value) * 100), 1)
          ELSE 0 
        END as progress_percentage,
        DATEDIFF(g.Target_Date, CURDATE()) as days_remaining
      FROM Goals g
      WHERE g.UserID = ?
    `;
    
    let params = [userId];
    
    if (status) {
      sql += ' AND g.Status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY g.Priority DESC, g.Created_Date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [goals] = await query(sql, params);

    res.json({
      success: true,
      data: goals,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: goals.length
      }
    });

  } catch (error) {
    console.error('Get goals error:', error);
    res.status(500).json({
      error: 'Failed to fetch goals',
      message: error.message
    });
  }
});

// ==============================================
// GET GOAL BY ID
// ==============================================
router.get('/:goalId', auth, async (req, res) => {
  try {
    const { goalId } = req.params;
    const userId = req.user.userId;

    const [goalDetails] = await query(`
      SELECT 
        g.*,
        CASE 
          WHEN g.Target_Value > 0 THEN 
            ROUND(((g.Current_Value / g.Target_Value) * 100), 1)
          ELSE 0 
        END as progress_percentage,
        DATEDIFF(g.Target_Date, CURDATE()) as days_remaining,
        DATEDIFF(CURDATE(), g.Start_Date) as days_elapsed
      FROM Goals g
      WHERE g.GoalID = ? AND g.UserID = ?
    `, [goalId, userId]);

    if (goalDetails.length === 0) {
      return res.status(404).json({
        error: 'Goal not found',
        message: 'Goal does not exist or access denied'
      });
    }

    // Get progress history
    const [progressHistory] = await query(`
      SELECT 
        pt.Value, pt.Date_Recorded, pt.Notes, pt.Data_Source
      FROM Progress_Tracking pt
      WHERE pt.GoalID = ? AND pt.UserID = ?
      ORDER BY pt.Date_Recorded DESC
      LIMIT 20
    `, [goalId, userId]);

    res.json({
      success: true,
      data: {
        ...goalDetails[0],
        progress_history: progressHistory
      }
    });

  } catch (error) {
    console.error('Get goal details error:', error);
    res.status(500).json({
      error: 'Failed to fetch goal details',
      message: error.message
    });
  }
});

// ==============================================
// CREATE NEW GOAL
// ==============================================
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      goalType, goalTitle, targetValue, unit, startDate, targetDate,
      priority, category, description, notes
    } = req.body;

    // Validate required fields
    if (!goalType || !goalTitle || !targetValue || !startDate || !targetDate) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Goal type, title, target value, start date, and target date are required'
      });
    }

    // Validate date logic
    if (new Date(targetDate) <= new Date(startDate)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Target date must be after start date'
      });
    }

    // Check active goals limit
    const [activeGoalsCount] = await query(
      'SELECT COUNT(*) as count FROM Goals WHERE UserID = ? AND Status = ?',
      [userId, 'Active']
    );

    if (activeGoalsCount[0].count >= 10) {
      return res.status(400).json({
        error: 'Goal limit exceeded',
        message: 'You can have maximum 10 active goals at a time'
      });
    }

    // Insert new goal
    const [goalResult] = await query(`
      INSERT INTO Goals (
        UserID, Goal_Type, Goal_Title, Target_Value, Unit, Start_Date, Target_Date,
        Priority, Category, Description, Notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId, goalType, goalTitle, targetValue, unit || 'unit', startDate, targetDate,
      priority || 'Medium', category || 'Fitness', description, notes
    ]);

    const goalId = goalResult.insertId;

    // Log activity
    await query(
      'INSERT INTO Activity_Logs (UserID, Activity_Type, Description, Status) VALUES (?, ?, ?, ?)',
      [userId, 'Goal_Update', `Created new goal: ${goalTitle}`, 'Success']
    );

    res.status(201).json({
      success: true,
      message: 'Goal created successfully',
      data: { goalId }
    });

  } catch (error) {
    console.error('Create goal error:', error);
    res.status(500).json({
      error: 'Failed to create goal',
      message: error.message
    });
  }
});

// ==============================================
// UPDATE GOAL PROGRESS
// ==============================================
router.put('/:goalId/progress', auth, async (req, res) => {
  try {
    const { goalId } = req.params;
    const userId = req.user.userId;
    const { currentValue, notes } = req.body;

    if (currentValue === undefined || currentValue < 0) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Valid current value is required'
      });
    }

    // Verify goal ownership
    const [goalCheck] = await query(
      'SELECT Goal_Type, Goal_Title, Target_Value FROM Goals WHERE GoalID = ? AND UserID = ?',
      [goalId, userId]
    );

    if (goalCheck.length === 0) {
      return res.status(404).json({
        error: 'Goal not found',
        message: 'Goal does not exist or access denied'
      });
    }

    // Update goal progress using stored procedure
    try {
      await callProcedure('UpdateGoalProgress', [goalId, currentValue]);
    } catch (procError) {
      console.warn('Stored procedure not available, updating manually');
      
      // Manual update as fallback
      const goal = goalCheck[0];
      let newStatus = 'Active';
      
      // Determine if goal is completed
      if ((goal.Goal_Type === 'Weight Loss' && currentValue <= goal.Target_Value) ||
          (['Weight Gain', 'Muscle Gain', 'Strength', 'Endurance'].includes(goal.Goal_Type) && currentValue >= goal.Target_Value)) {
        newStatus = 'Completed';
      }
      
      await query(`
        UPDATE Goals 
        SET Current_Value = ?, Status = ?, Updated_Date = CURRENT_TIMESTAMP,
            Completed_Date = CASE WHEN ? = 'Completed' AND Status != 'Completed' 
                                 THEN CURRENT_TIMESTAMP 
                                 ELSE Completed_Date END
        WHERE GoalID = ?
      `, [currentValue, newStatus, newStatus, goalId]);

      // Add progress tracking entry
      await query(`
        INSERT INTO Progress_Tracking (UserID, GoalID, Metric_Type, Value, Date_Recorded, Notes, Data_Source)
        VALUES (?, ?, ?, ?, CURDATE(), ?, ?)
      `, [userId, goalId, 'Custom', currentValue, notes, 'Manual']);
    }

    // Log activity
    await query(
      'INSERT INTO Activity_Logs (UserID, Activity_Type, Description, Status) VALUES (?, ?, ?, ?)',
      [userId, 'Goal_Update', `Updated progress for goal: ${goalCheck[0].Goal_Title}`, 'Success']
    );

    res.json({
      success: true,
      message: 'Goal progress updated successfully'
    });

  } catch (error) {
    console.error('Update goal progress error:', error);
    res.status(500).json({
      error: 'Failed to update goal progress',
      message: error.message
    });
  }
});

// ==============================================
// UPDATE GOAL STATUS
// ==============================================
router.put('/:goalId/status', auth, async (req, res) => {
  try {
    const { goalId } = req.params;
    const userId = req.user.userId;
    const { status } = req.body;

    const validStatuses = ['Active', 'Completed', 'Paused', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    // Verify goal ownership
    const [goalCheck] = await query(
      'SELECT Goal_Title FROM Goals WHERE GoalID = ? AND UserID = ?',
      [goalId, userId]
    );

    if (goalCheck.length === 0) {
      return res.status(404).json({
        error: 'Goal not found',
        message: 'Goal does not exist or access denied'
      });
    }

    // Update goal status
    await query(`
      UPDATE Goals 
      SET Status = ?, Updated_Date = CURRENT_TIMESTAMP,
          Completed_Date = CASE WHEN ? = 'Completed' AND Status != 'Completed' 
                               THEN CURRENT_TIMESTAMP 
                               ELSE Completed_Date END
      WHERE GoalID = ?
    `, [status, status, goalId]);

    // Log activity
    await query(
      'INSERT INTO Activity_Logs (UserID, Activity_Type, Description, Status) VALUES (?, ?, ?, ?)',
      [userId, 'Goal_Update', `Changed status to ${status} for goal: ${goalCheck[0].Goal_Title}`, 'Success']
    );

    res.json({
      success: true,
      message: `Goal status updated to ${status}`
    });

  } catch (error) {
    console.error('Update goal status error:', error);
    res.status(500).json({
      error: 'Failed to update goal status',
      message: error.message
    });
  }
});

// ==============================================
// GET GOALS STATISTICS
// ==============================================
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [stats] = await query(`
      SELECT 
        COUNT(*) as total_goals,
        COUNT(CASE WHEN Status = 'Active' THEN 1 END) as active_goals,
        COUNT(CASE WHEN Status = 'Completed' THEN 1 END) as completed_goals,
        COUNT(CASE WHEN Status = 'Paused' THEN 1 END) as paused_goals,
        COUNT(CASE WHEN Status = 'Cancelled' THEN 1 END) as cancelled_goals,
        AVG(CASE WHEN Target_Value > 0 THEN (Current_Value / Target_Value) * 100 ELSE 0 END) as avg_progress
      FROM Goals
      WHERE UserID = ?
    `, [userId]);

    // Get goals by category
    const [categoryStats] = await query(`
      SELECT 
        Category,
        COUNT(*) as count,
        COUNT(CASE WHEN Status = 'Completed' THEN 1 END) as completed
      FROM Goals
      WHERE UserID = ?
      GROUP BY Category
      ORDER BY count DESC
    `, [userId]);

    // Get recent achievements
    const [recentAchievements] = await query(`
      SELECT 
        Goal_Title, Completed_Date, Goal_Type
      FROM Goals
      WHERE UserID = ? AND Status = 'Completed'
      ORDER BY Completed_Date DESC
      LIMIT 5
    `, [userId]);

    res.json({
      success: true,
      data: {
        summary: stats[0],
        by_category: categoryStats,
        recent_achievements: recentAchievements
      }
    });

  } catch (error) {
    console.error('Get goals statistics error:', error);
    res.status(500).json({
      error: 'Failed to fetch goals statistics',
      message: error.message
    });
  }
});

module.exports = router;
