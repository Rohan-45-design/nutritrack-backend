const express = require('express');
const { query, callProcedure } = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ==============================================
// GET ALL MEALS FOR USER
// ==============================================
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT 
        m.MealID, m.Meal_Type, m.Meal_Date, m.Meal_Time,
        m.Total_Calories, m.Total_Protein, m.Total_Carbs, m.Total_Fat, 
        m.Notes, m.Created_Date
      FROM Meals m 
      WHERE m.UserID = ?
    `;
    
    let params = [userId];
    
    if (date) {
      sql += ' AND m.Meal_Date = ?';
      params.push(date);
    }
    
    sql += ' ORDER BY m.Meal_Date DESC, m.Meal_Time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [meals] = await query(sql, params);

    res.json({
      success: true,
      data: meals,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: meals.length
      }
    });

  } catch (error) {
    console.error('Get meals error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch meals',
      message: error.message 
    });
  }
});

// ==============================================
// GET MEAL BY ID WITH DETAILS
// ==============================================
router.get('/:mealId', auth, async (req, res) => {
  try {
    const { mealId } = req.params;
    const userId = req.user.userId;

    // Get meal details with food items
    const [mealDetails] = await query(`
      SELECT 
        m.MealID, m.Meal_Type, m.Meal_Date, m.Meal_Time,
        m.Total_Calories, m.Total_Protein, m.Total_Carbs, m.Total_Fat, 
        m.Notes, m.Created_Date,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'food_name', f.Food_Name,
            'brand', f.Brand,
            'quantity', mi.Quantity,
            'calories', mi.Calories,
            'serving_size', f.Serving_Size
          )
        ) as food_items
      FROM Meals m
      LEFT JOIN Meal_Items mi ON m.MealID = mi.MealID
      LEFT JOIN Food_Items f ON mi.FoodID = f.FoodID
      WHERE m.MealID = ? AND m.UserID = ?
      GROUP BY m.MealID
    `, [mealId, userId]);

    if (mealDetails.length === 0) {
      return res.status(404).json({ 
        error: 'Meal not found',
        message: 'Meal does not exist or access denied' 
      });
    }

    res.json({
      success: true,
      data: mealDetails[0]
    });

  } catch (error) {
    console.error('Get meal details error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch meal details',
      message: error.message 
    });
  }
});

// ==============================================
// ADD NEW MEAL
// ==============================================
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { mealType, mealDate, mealTime, notes, foodItems } = req.body;

    // Validate required fields
    if (!mealType || !mealDate || !mealTime) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Meal type, date, and time are required' 
      });
    }

    // Insert meal
    const [mealResult] = await query(
      'INSERT INTO Meals (UserID, Meal_Type, Meal_Date, Meal_Time, Notes) VALUES (?, ?, ?, ?, ?)',
      [userId, mealType, mealDate, mealTime, notes]
    );

    const mealId = mealResult.insertId;

    // Insert meal items if provided
    if (foodItems && foodItems.length > 0) {
      for (const item of foodItems) {
        const { foodId, quantity, servingUnit = 'serving' } = item;
        
        if (!foodId || !quantity || quantity <= 0) {
          continue; // Skip invalid items
        }

        // Get food calories and nutritional info
        const [foodData] = await query(
          'SELECT Calories_Per_Serving, Protein, Carbohydrates, Fat FROM Food_Items WHERE FoodID = ?',
          [foodId]
        );

        if (foodData.length > 0) {
          const food = foodData[0];
          const calories = food.Calories_Per_Serving * quantity;
          const protein = food.Protein * quantity;
          const carbs = food.Carbohydrates * quantity;
          const fat = food.Fat * quantity;
          
          await query(
            `INSERT INTO Meal_Items (MealID, FoodID, Quantity, Serving_Unit, Calories, Protein, Carbohydrates, Fat) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [mealId, foodId, quantity, servingUnit, calories, protein, carbs, fat]
          );
        }
      }

      // Update meal totals using stored procedure
      try {
        await callProcedure('UpdateMealTotals', [mealId]);
      } catch (procError) {
        console.warn('Stored procedure not available, calculating manually');
        
        // Manual calculation as fallback
        const [totals] = await query(`
          SELECT 
            COALESCE(SUM(mi.Calories), 0) as total_calories,
            COALESCE(SUM(mi.Protein), 0) as total_protein,
            COALESCE(SUM(mi.Carbohydrates), 0) as total_carbs,
            COALESCE(SUM(mi.Fat), 0) as total_fat
          FROM Meal_Items mi 
          WHERE mi.MealID = ?
        `, [mealId]);

        if (totals.length > 0) {
          await query(
            `UPDATE Meals SET 
             Total_Calories = ?, Total_Protein = ?, Total_Carbs = ?, Total_Fat = ?
             WHERE MealID = ?`,
            [totals[0].total_calories, totals[0].total_protein, totals[0].total_carbs, totals[0].total_fat, mealId]
          );
        }
      }
    }

    // Log activity
    await query(
      'INSERT INTO Activity_Logs (UserID, Activity_Type, Description, Status) VALUES (?, ?, ?, ?)',
      [userId, 'Meal_Log', `Added ${mealType} meal`, 'Success']
    );

    res.status(201).json({
      success: true,
      message: 'Meal added successfully',
      data: { mealId }
    });

  } catch (error) {
    console.error('Add meal error:', error);
    res.status(500).json({ 
      error: 'Failed to add meal',
      message: error.message 
    });
  }
});

// ==============================================
// GET DAILY NUTRITION SUMMARY
// ==============================================
router.get('/summary/:date', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date } = req.params;

    // Try to use stored procedure first
    try {
      const [summary] = await callProcedure('GetUserDailySummary', [userId, date]);
      
      res.json({
        success: true,
        data: summary[0] || {}
      });
    } catch (procError) {
      console.warn('Stored procedure not available, calculating manually');
      
      // Manual calculation as fallback
      const [summary] = await query(`
        SELECT 
          ? as Summary_Date,
          COALESCE(SUM(m.Total_Calories), 0) AS Daily_Calories_Consumed,
          COALESCE(SUM(m.Total_Protein), 0) AS Daily_Protein,
          COALESCE(SUM(m.Total_Carbs), 0) AS Daily_Carbs,
          COALESCE(SUM(m.Total_Fat), 0) AS Daily_Fat,
          COUNT(DISTINCT m.MealID) AS Meals_Logged
        FROM Meals m
        WHERE m.UserID = ? AND m.Meal_Date = ?
      `, [date, userId, date]);

      res.json({
        success: true,
        data: summary[0] || { Summary_Date: date, Daily_Calories_Consumed: 0, Daily_Protein: 0, Daily_Carbs: 0, Daily_Fat: 0, Meals_Logged: 0 }
      });
    }

  } catch (error) {
    console.error('Get daily summary error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch daily summary',
      message: error.message 
    });
  }
});

// ==============================================
// SEARCH FOOD ITEMS
// ==============================================
router.get('/foods/search', async (req, res) => {
  try {
    const { q, limit = 20, category } = req.query;

    if (!q) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Search query is required' 
      });
    }

    let sql = `
      SELECT 
        FoodID, Food_Name, Brand, Serving_Size, Calories_Per_Serving, 
        Protein, Carbohydrates, Fat, Category, Verified
      FROM Food_Items 
      WHERE (Food_Name LIKE ? OR Brand LIKE ?)
    `;
    
    let params = [`%${q}%`, `%${q}%`];

    if (category) {
      sql += ' AND Category = ?';
      params.push(category);
    }

    sql += ' ORDER BY Verified DESC, Food_Name ASC LIMIT ?';
    params.push(parseInt(limit));

    const [foods] = await query(sql, params);

    res.json({
      success: true,
      data: foods,
      query: q,
      total: foods.length
    });

  } catch (error) {
    console.error('Food search error:', error);
    res.status(500).json({ 
      error: 'Failed to search foods',
      message: error.message 
    });
  }
});

module.exports = router;
