import crypto from 'crypto';

/**
 * Generate a cryptographically secure 6-digit OTP.
 * @returns {string} 6-digit string (e.g. "048291")
 */
export const generateSecureOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Create an HMAC-SHA256 hash of the given data.
 * @param {string} data
 * @param {string} secret
 * @returns {string} hex digest
 */
export const hmacHash = (data, secret) => {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
};

/**
 * Generate a cryptographically random hex token.
 * @param {number} length  Number of random bytes (token will be 2× this length in hex)
 * @returns {string}
 */
export const generateToken = (length = 48) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Sleep for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pick specified keys from an object.
 * @param {object} obj
 * @param {string[]} keys
 * @returns {object}
 */
export const pick = (obj, keys) => {
  return keys.reduce((acc, key) => {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
      acc[key] = obj[key];
    }
    return acc;
  }, {});
};

/**
 * Omit specified keys from an object.
 * @param {object} obj
 * @param {string[]} keys
 * @returns {object}
 */
export const omit = (obj, keys) => {
  const keysSet = new Set(keys);
  return Object.keys(obj).reduce((acc, key) => {
    if (!keysSet.has(key)) {
      acc[key] = obj[key];
    }
    return acc;
  }, {});
};

/**
 * Escape special regular expression characters in user-supplied search strings
 * to prevent Regex Injection / ReDoS attacks.
 * @param {string} str
 * @returns {string}
 */
export const escapeRegex = (str) => {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Sanitize user input to prevent NoSQL injection.
 * Strips keys starting with `$` and nested objects that could be operators.
 * @param {*} value
 * @returns {*}
 */
export const sanitize = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);

  const clean = {};
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith('$')) continue;               // strip MongoDB operators
    clean[k] = typeof v === 'object' ? sanitize(v) : v;
  }
  return clean;
};

