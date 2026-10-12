import { escapeHtml } from './security.js';

// Decorative customer / project colour swatch.
export const colorDotHtml = (color) =>
  `<span class="tt-color-dot" style="background:${escapeHtml(color)};" aria-hidden="true"></span>`;
