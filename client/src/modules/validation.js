/**
 * Form validation utilities
 */

/**
 * Display error state on a form field
 * @param {HTMLElement} input - The input or textarea element
 * @param {string} errorMessage - The error message to display
 */
export function showFieldError(input, errorMessage) {
  if (!input) return;
  
  const formGroup = input.closest('.form-group');
  if (!formGroup) return;
  
  formGroup.classList.add('error');
  
  // Create or update error message
  let errorMsg = formGroup.querySelector('.error-message');
  if (!errorMsg) {
    errorMsg = document.createElement('div');
    errorMsg.classList.add('error-message');
    formGroup.appendChild(errorMsg);
  }
  errorMsg.textContent = errorMessage;
  
  input.focus();
}

/**
 * Clear error state from a form field
 * @param {HTMLElement} input - The input or textarea element
 */
export function clearFieldError(input) {
  if (!input) return;
  
  const formGroup = input.closest('.form-group');
  if (!formGroup) return;
  
  formGroup.classList.remove('error');
}

/**
 * Validate that a task title is not empty
 * @param {string} title - The title value to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function validateTaskTitle(title) {
  return (title?.trim() || '').length > 0;
}

/**
 * Validate task title and show error if invalid
 * @param {HTMLElement} titleInput - The title input element
 * @returns {boolean} - True if valid, false if invalid
 */
export function validateAndShowTaskTitleError(titleInput) {
  const title = titleInput?.value?.trim() || '';
  
  if (!validateTaskTitle(title)) {
    showFieldError(titleInput, 'Task title is required');
    return false;
  }
  
  clearFieldError(titleInput);
  return true;
}

/**
 * Validate that a column name is not empty
 * @param {string} name - The name value to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function validateColumnName(name) {
  return (name?.trim() || '').length > 0;
}

/**
 * Validate column name and show error if invalid
 * @param {HTMLElement} nameInput - The name input element
 * @returns {boolean} - True if valid, false if invalid
 */
export function validateAndShowColumnNameError(nameInput) {
  const name = nameInput?.value?.trim() || '';
  
  if (!validateColumnName(name)) {
    showFieldError(nameInput, 'Column name is required');
    return false;
  }
  
  clearFieldError(nameInput);
  return true;
}
