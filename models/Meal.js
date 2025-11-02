const { query, callProcedure } = require('../config/database');

class Meal {
  constructor(mealData) {
    this.mealId = mealData.MealID;
    this.userId = mealData.UserID;
    this.mealType = mealData.Meal_Type;
    this.mealDate = mealData.Meal_Date;
    this.mealTime = mealData.Meal_Time;
    this.totalCalories = mealData.Total_Calories;
    this.totalProtein = mealData.Total_Protein;
    this.totalCarbs = mealData.Total_Carbs;
    this.totalFat = mealData.Total_Fat;
    this.notes = mealData.Notes;
    this.createdDate = mealData.Created_Date;
  }

  // Static method to find meal by ID
  static async findById(mealId, userId = null) {
    try {
      let sql = 'SELECT * FROM Meals WHERE MealID = ?';
      let params = [mealId];
      
      if (userId) {
        sql += ' AND UserID = ?';
        params.push(userId);
      }

      const [meals] = await query(sql, params);
      
      if (meals.length === 0) {
        return null;
      }
      
      return new Meal(meals[0]);
    } catch (error) {
      console.error('Meal findById error:', error);
      throw error;
    }
  }

  // Static method to find meals by user and date
  static async findByUserAndDate(userId, date) {
    try {
      const [meals] = await query(`
        SELECT * FROM Meals 
        WHERE UserID = ? AND Meal_Date = ?
        ORDER BY Meal_Time ASC
      `, [userId, date]);
      
      return meals.map(mealData => new Meal(mealData));
    } catch (error) {
      console.error('Meal findByUserAndDate error:', error);
      throw error;
    }
  }

  // Static method to create new meal
  static async create(mealData) {
    try {
      const {
        userId, mealType, mealDate, mealTime, notes
      } = mealData;

      const [result] = await query(`
        INSERT INTO Meals (UserID, Meal_Type, Meal_Date, Meal_Time, Notes)
        VALUES (?, ?, ?, ?, ?)
      `, [userId, mealType, mealDate, mealTime, notes]);

      return await Meal.findById(result.insertId);
    } catch (error) {
      console.error('Meal create error:', error);
      throw error;
    }
  }

  // Instance method to add food item
  async addFoodItem(foodId, quantity, servingUnit = 'serving') {
    try {
      // Get food nutritional data
      const [foodData] = await query(
        'SELECT Calories_Per_Serving, Protein, Carbohydrates, Fat FROM Food_Items WHERE FoodID = ?',
        [foodId]
      );

      if (foodData.length === 0) {
        throw new Error('Food item not found');
      }

      const food = foodData[0];
      const calories = food.Calories_Per_Serving * quantity;
      const protein = food.Protein * quantity;
      const carbs = food.Carbohydrates * quantity;
      const fat = food.Fat * quantity;

      // Insert meal item
      await query(`
        INSERT INTO Meal_Items (MealID, FoodID, Quantity, Serving_Unit, Calories, Protein, Carbohydrates, Fat)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [this.mealId, foodId, quantity, servingUnit, calories, protein, carbs, fat]);

      // Update meal totals
      await this.updateTotals();

      return true;
    } catch (error) {
      console.error('Add food item error:', error);
      throw error;
    }
  }

  // Instance method to update meal totals
  async updateTotals() {
    try {
      // Try stored procedure first
      try {
        await callProcedure('UpdateMealTotals', [this.mealId]);
      } catch (procError) {
        // Fallback to manual calculation
        const [totals] = await query(`
          SELECT 
            COALESCE(SUM(mi.Calories), 0) as total_calories,
            COALESCE(SUM(mi.Protein), 0) as total_protein,
            COALESCE(SUM(mi.Carbohydrates), 0) as total_carbs,
            COALESCE(SUM(mi.Fat), 0) as total_fat
          FROM Meal_Items mi 
          WHERE mi.MealID = ?
        `, [this.mealId]);

        if (totals.length > 0) {
          await query(`
            UPDATE Meals 
            SET Total_Calories = ?, Total_Protein = ?, Total_Carbs = ?, Total_Fat = ?
            WHERE MealID = ?
          `, [
            totals[0].total_calories, totals[0].total_protein,
            totals[0].total_carbs, totals[0].total_fat, this.mealId
          ]);
        }
      }

      // Refresh meal data
      const updatedMeal = await Meal.findById(this.mealId);
      if (updatedMeal) {
        Object.assign(this, updatedMeal);
      }

      return true;
    } catch (error) {
      console.error('Update totals error:', error);
      throw error;
    }
  }

  // Instance method to get meal items
  async getMealItems() {
    try {
      const [items] = await query(`
        SELECT 
          mi.*, f.Food_Name, f.Brand, f.Serving_Size,
          f.Calories_Per_Serving, f.Category
        FROM Meal_Items mi
        JOIN Food_Items f ON mi.FoodID = f.FoodID
        WHERE mi.MealID = ?
        ORDER BY mi.Created_Date ASC
      `, [this.mealId]);

      return items;
    } catch (error) {
      console.error('Get meal items error:', error);
      throw error;
    }
  }

  // Static method to get daily summary for user
  static async getDailySummary(userId, date) {
    try {
      const [summary] = await query(`
        SELECT 
          COALESCE(SUM(m.Total_Calories), 0) AS Daily_Calories,
          COALESCE(SUM(m.Total_Protein), 0) AS Daily_Protein,
          COALESCE(SUM(m.Total_Carbs), 0) AS Daily_Carbs,
          COALESCE(SUM(m.Total_Fat), 0) AS Daily_Fat,
          COUNT(m.MealID) AS Meals_Count
        FROM Meals m
        WHERE m.UserID = ? AND m.Meal_Date = ?
      `, [userId, date]);

      return summary.length > 0 ? summary[0] : {
        Daily_Calories: 0,
        Daily_Protein: 0,
        Daily_Carbs: 0,
        Daily_Fat: 0,
        Meals_Count: 0
      };
    } catch (error) {
      console.error('Get daily summary error:', error);
      throw error;
    }
  }
}

module.exports = Meal;
