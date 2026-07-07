/**
 * Validation utilities for form fields
 * Following BEST_PRACTICES.md: DRY principle, reusable validation logic
 */

export interface ValidationResult {
  isValid: boolean;
  error: string;
}

/**
 * Generic field validation for text inputs with length constraints
 * @param value - The field value to validate
 * @param minLength - Minimum allowed length
 * @param maxLength - Maximum allowed length
 * @param fieldName - Display name for error messages
 * @returns ValidationResult with error message if invalid
 */
export function validateField(
  value: string,
  minLength: number,
  maxLength: number,
  fieldName: string
): ValidationResult {
  if (value.length === 0) {
    return { isValid: true, error: '' };
  }

  if (value.length < minLength) {
    return {
      isValid: false,
      error: `${fieldName} must be at least ${minLength} characters`,
    };
  }

  if (value.length > maxLength) {
    return {
      isValid: false,
      error: `${fieldName} cannot exceed ${maxLength} characters`,
    };
  }

  return { isValid: true, error: '' };
}

/**
 * Validates name length
 * Rules: 3-25 characters
 */
export function validateName(name: string): ValidationResult {
  return validateField(name, 3, 25, 'Name');
}

/**
 * Validates email format
 * Rules: Valid email format, max 254 characters
 */
export function validateEmail(email: string): ValidationResult {
  if (email.length === 0) {
    return { isValid: true, error: '' };
  }

  if (email.length > 254) {
    return {
      isValid: false,
      error: 'Email is too long',
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return {
      isValid: false,
      error: 'Please enter a valid email',
    };
  }

  return { isValid: true, error: '' };
}

/**
 * Validates password match
 * Rules: Both passwords must match and be at least 6 characters
 */
export function validatePasswordMatch(
  password: string,
  confirmPassword: string
): ValidationResult {
  if (confirmPassword.length === 0) {
    return { isValid: true, error: '' };
  }

  if (password !== confirmPassword) {
    return {
      isValid: false,
      error: 'Passwords do not match',
    };
  }

  return { isValid: true, error: '' };
}

/**
 * Validates password strength
 * Rules: Minimum 6 characters
 */
export function validatePassword(password: string): ValidationResult {
  if (password.length === 0) {
    return { isValid: true, error: '' };
  }

  if (password.length < 6) {
    return {
      isValid: false,
      error: 'Password must be at least 6 characters',
    };
  }

  return { isValid: true, error: '' };
}
