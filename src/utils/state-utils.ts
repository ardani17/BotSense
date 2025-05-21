import TelegramBot from 'node-telegram-bot-api';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Utility functions for handling user state management
 */

// Types
export interface UserState {
  mode: 'menu' | 'location' | 'rar' | null;
  lastActivity: number;
}

// In-memory state storage
const userStates = new Map<number, UserState>();

/**
 * Initialize a user's state
 * @param userId The Telegram user ID
 */
export const initUserState = (userId: number): void => {
  if (!userStates.has(userId)) {
    userStates.set(userId, {
      mode: null,
      lastActivity: Date.now()
    });
  }
};

/**
 * Set a user's mode
 * @param userId The Telegram user ID
 * @param mode The mode to set
 */
export const setUserMode = (userId: number, mode: UserState['mode']): void => {
  const currentState = userStates.get(userId) || { mode: null, lastActivity: Date.now() };
  userStates.set(userId, {
    ...currentState,
    mode,
    lastActivity: Date.now()
  });
};

/**
 * Get a user's current mode
 * @param userId The Telegram user ID
 * @returns The user's current mode, or null if not set
 */
export const getUserMode = (userId: number): UserState['mode'] => {
  return userStates.get(userId)?.mode || null;
};

/**
 * Update a user's last activity timestamp
 * @param userId The Telegram user ID
 */
export const updateUserActivity = (userId: number): void => {
  const currentState = userStates.get(userId);
  if (currentState) {
    userStates.set(userId, {
      ...currentState,
      lastActivity: Date.now()
    });
  }
};

/**
 * Get all users with their current states
 * @returns A map of user IDs to their states
 */
export const getAllUserStates = (): Map<number, UserState> => {
  return new Map(userStates);
};

/**
 * Clear inactive users (optional, for memory management)
 * @param maxInactiveTime Maximum inactive time in milliseconds before clearing state
 */
export const clearInactiveUsers = (maxInactiveTime: number = 24 * 60 * 60 * 1000): void => {
  const now = Date.now();
  for (const [userId, state] of userStates.entries()) {
    if (now - state.lastActivity > maxInactiveTime) {
      userStates.delete(userId);
    }
  }
};
