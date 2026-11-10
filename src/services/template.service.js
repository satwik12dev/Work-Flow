import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.resolve(__dirname, '../templates');

const templateCache = new Map();

/**
 * Basic template interpolation supporting `{{key}}` and `{{#if key}}...{{/if}}`.
 */
const renderString = (template, variables = {}) => {
  let output = template;

  // Process simple {{#if condition}}...{{/if}} blocks
  output = output.replace(/{{#if\s+([\w.]+)}}\s*([\s\S]*?){{\/if}}/g, (match, key, content) => {
    const val = key.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), variables);
    return val ? renderString(content, variables) : '';
  });

  // Process {{key}} variables
  output = output.replace(/{{([\w.]+)}}/g, (match, key) => {
    const val = key.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), variables);
    return val !== undefined && val !== null ? String(val) : '';
  });

  return output;
};

export const templateService = {
  /**
   * Load and render an HTML template by filename.
   * @param {string} templateName - e.g. 'otpVerification.html'
   * @param {object} variables - data for interpolation
   * @returns {Promise<string>} rendered HTML
   */
  async render(templateName, variables = {}) {
    try {
      let rawTemplate = templateCache.get(templateName);
      if (!rawTemplate) {
        const filePath = path.join(TEMPLATES_DIR, templateName);
        rawTemplate = await fs.readFile(filePath, 'utf-8');
        templateCache.set(templateName, rawTemplate);
      }
      return renderString(rawTemplate, variables);
    } catch (err) {
      logger.error(`Error rendering template ${templateName}:`, err);
      throw err;
    }
  },
};

