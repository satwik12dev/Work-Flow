/**
 * Auth-related constants shared across modules.
 */

export const OTP_PURPOSES = Object.freeze({
  REGISTRATION: 'REGISTRATION',
  FORGOT_PASSWORD: 'FORGOT_PASSWORD',
  EMAIL_CHANGE: 'EMAIL_CHANGE',
});

export const MEMBER_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
});

export const INVITATION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
});

/**
 * Parse a duration string like "15m", "7d", "2h" to milliseconds.
 * Falls back to 7 days if the format is unrecognized.
 * @param {string} str
 * @returns {number} milliseconds
 */
export const parseDuration = (str) => {
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const [, num, unit] = match;
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return parseInt(num, 10) * multipliers[unit];
};

