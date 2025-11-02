// Utility helper functions for NutriTrack Pro

// ==============================================
// DATE UTILITIES
// ==============================================

const formatDate = (date) => {
    if (!date) return null;
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    
    return d.toISOString().split('T')[0];
  };
  
  const formatDateTime = (date) => {
    if (!date) return null;
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    
    return d.toISOString();
  };
  
  const formatTime = (time) => {
    if (!time) return null;
    
    // Handle both HH:MM:SS and HH:MM formats
    if (typeof time === 'string') {
      const parts = time.split(':');
      if (parts.length >= 2) {
        const hours = parts[0].padStart(2, '0');
        const minutes = parts[1].padStart(2, '0');
        const seconds = parts.length > 2 ? parts[2].padStart(2, '0') : '00';
        return `${hours}:${minutes}:${seconds}`;
      }
    }
    
    return time;
  };
  
  const getDaysAgo = (days) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return formatDate(date);
  };
  
  const getDaysFromNow = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return formatDate(date);
  };
  
  // ==============================================
  // VALIDATION UTILITIES
  // ==============================================
  
  const validateEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.toLowerCase());
  };
  
  const validatePassword = (password) => {
    if (!password || typeof password !== 'string') return false;
    
    return {
      isValid: password.length >= 6,
      length: password.length >= 6,
      hasLetter: /[a-zA-Z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
  };
  
  const validatePhoneNumber = (phone) => {
    if (!phone || typeof phone !== 'string') return false;
    
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Check if it's a valid length (10-15 digits)
    return cleaned.length >= 10 && cleaned.length <= 15;
  };
  
  const validateAge = (dateOfBirth, minAge = 13) => {
    if (!dateOfBirth) return false;
    
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    
    if (isNaN(birthDate.getTime())) return false;
    
    const age = Math.floor((today - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
    return age >= minAge;
  };
  
  // ==============================================
  // CALCULATION UTILITIES
  // ==============================================
  
  const calculateBMI = (weight, height) => {
    if (!weight || !height || weight <= 0 || height <= 0) return null;
    
    const heightInMeters = height / 100;
    const bmi = weight / (heightInMeters * heightInMeters);
    
    return Math.round(bmi * 10) / 10; // Round to 1 decimal place
  };
  
  const getBMICategory = (bmi) => {
    if (!bmi || bmi <= 0) return 'Invalid';
    
    if (bmi < 18.5) return 'Underweight';
    if (bmi < 25.0) return 'Normal';
    if (bmi < 30.0) return 'Overweight';
    return 'Obese';
  };
  
  const calculateBMR = (weight, height, age, gender) => {
    if (!weight || !height || !age || !gender) return null;
    if (weight <= 0 || height <= 0 || age <= 0) return null;
    
    let bmr;
    
    if (gender.toLowerCase() === 'male') {
      bmr = 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
    } else if (gender.toLowerCase() === 'female') {
      bmr = 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
    } else {
      // For 'other' gender, use average of male and female
      const maleBMR = 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
      const femaleBMR = 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
      bmr = (maleBMR + femaleBMR) / 2;
    }
    
    return Math.round(bmr);
  };
  
  const calculateTDEE = (bmr, activityLevel) => {
    if (!bmr || bmr <= 0) return null;
    
    const activityMultipliers = {
      'Sedentary': 1.2,
      'Lightly Active': 1.375,
      'Moderately Active': 1.55,
      'Very Active': 1.725,
      'Extremely Active': 1.9
    };
    
    const multiplier = activityMultipliers[activityLevel] || 1.55;
    return Math.round(bmr * multiplier);
  };
  
  const calculateCaloriesBurned = (exerciseCaloriesPerMinute, durationMinutes, userWeight = 70) => {
    if (!exerciseCaloriesPerMinute || !durationMinutes || exerciseCaloriesPerMinute <= 0 || durationMinutes <= 0) {
      return 0;
    }
    
    const weightFactor = userWeight / 70; // 70kg baseline
    const calories = exerciseCaloriesPerMinute * durationMinutes * weightFactor;
    
    return Math.round(calories * 10) / 10; // Round to 1 decimal place
  };
  
  const calculateGoalProgress = (currentValue, targetValue, goalType = 'default') => {
    if (!targetValue || targetValue <= 0) return 0;
    if (currentValue < 0) return 0;
    
    let progress;
    
    if (goalType === 'Weight Loss') {
      // For weight loss, progress is inverse (lower current value = higher progress)
      progress = Math.max(0, ((targetValue - currentValue) / targetValue) * 100);
    } else {
      // For other goals, higher current value = higher progress
      progress = (currentValue / targetValue) * 100;
    }
    
    return Math.min(100, Math.max(0, Math.round(progress * 10) / 10));
  };
  
  // ==============================================
  // FORMATTING UTILITIES
  // ==============================================
  
  const formatNumber = (num, decimals = 1) => {
    if (num === null || num === undefined || isNaN(num)) return '0';
    
    return Number(num).toFixed(decimals);
  };
  
  const formatDuration = (minutes) => {
    if (!minutes || minutes <= 0) return '0 min';
    
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    
    if (remainingMinutes === 0) {
      return `${hours} hr`;
    }
    
    return `${hours} hr ${remainingMinutes} min`;
  };
  
  const formatWeight = (weight, unit = 'kg') => {
    if (!weight || weight <= 0) return `0 ${unit}`;
    
    return `${formatNumber(weight, 1)} ${unit}`;
  };
  
  const formatHeight = (height, unit = 'cm') => {
    if (!height || height <= 0) return `0 ${unit}`;
    
    if (unit === 'ft') {
      const feet = Math.floor(height / 30.48);
      const inches = Math.round((height / 2.54) % 12);
      return `${feet}'${inches}"`;
    }
    
    return `${Math.round(height)} ${unit}`;
  };
  
  // ==============================================
  // DATA UTILITIES
  // ==============================================
  
  const sanitizeString = (str, maxLength = 255) => {
    if (!str || typeof str !== 'string') return '';
    
    return str.trim().substring(0, maxLength);
  };
  
  const parseJSON = (jsonString, defaultValue = null) => {
    if (!jsonString || typeof jsonString !== 'string') return defaultValue;
    
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.warn('JSON parse error:', error.message);
      return defaultValue;
    }
  };
  
  const generateRandomString = (length = 10) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  };
  
  const slugify = (text) => {
    if (!text || typeof text !== 'string') return '';
    
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
      .replace(/^-+|-+$/g, ''); // Remove leading and trailing hyphens
  };
  
  // ==============================================
  // ERROR UTILITIES
  // ==============================================
  
  const createError = (message, statusCode = 500, code = null) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
  };
  
  const handleAsyncError = (fn) => {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };
  
  // ==============================================
  // RESPONSE UTILITIES
  // ==============================================
  
  const sendSuccess = (res, data = null, message = 'Success', statusCode = 200) => {
    const response = {
      success: true,
      message
    };
    
    if (data !== null) {
      response.data = data;
    }
    
    return res.status(statusCode).json(response);
  };
  
  const sendError = (res, message = 'Internal server error', statusCode = 500, error = null) => {
    const response = {
      success: false,
      error: message
    };
    
    if (error && process.env.NODE_ENV === 'development') {
      response.details = error.message;
    }
    
    return res.status(statusCode).json(response);
  };
  
  // ==============================================
  // EXPORTS
  // ==============================================
  
  module.exports = {
    // Date utilities
    formatDate,
    formatDateTime,
    formatTime,
    getDaysAgo,
    getDaysFromNow,
    
    // Validation utilities
    validateEmail,
    validatePassword,
    validatePhoneNumber,
    validateAge,
    
    // Calculation utilities
    calculateBMI,
    getBMICategory,
    calculateBMR,
    calculateTDEE,
    calculateCaloriesBurned,
    calculateGoalProgress,
    
    // Formatting utilities
    formatNumber,
    formatDuration,
    formatWeight,
    formatHeight,
    
    // Data utilities
    sanitizeString,
    parseJSON,
    generateRandomString,
    slugify,
    
    // Error utilities
    createError,
    handleAsyncError,
    
    // Response utilities
    sendSuccess,
    sendError
  };
  