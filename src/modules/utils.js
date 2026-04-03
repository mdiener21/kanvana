/**
 * Returns '#000000' or '#ffffff' for readable text on the given hex background.
 * Uses perceived luminance: (R*299 + G*587 + B*114) / 1000.
 * Threshold 150 (of 255) favors white text on mid-tones.
 */
export function labelTextColor(hex) {
  const c = parseInt(hex.replace('#', ''), 16);
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance > 150 ? '#000000' : '#ffffff';
}

// Simple UUID v4 generator (pure JavaScript)
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
