export const PRIORITY = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
});

export const ALL_PRIORITIES = Object.values(PRIORITY);

/**
 * Numeric weight for priority-based sorting (higher = more urgent).
 */
export const PRIORITY_WEIGHT = Object.freeze({
  [PRIORITY.LOW]: 1,
  [PRIORITY.MEDIUM]: 2,
  [PRIORITY.HIGH]: 3,
  [PRIORITY.URGENT]: 4,
});

