/**
 * Utility functions for handling user state management
 */
export interface UserState {
    mode: 'menu' | 'location' | 'rar' | null;
    lastActivity: number;
}
/**
 * Initialize a user's state
 * @param userId The Telegram user ID
 */
export declare const initUserState: (userId: number) => void;
/**
 * Set a user's mode
 * @param userId The Telegram user ID
 * @param mode The mode to set
 */
export declare const setUserMode: (userId: number, mode: UserState["mode"]) => void;
/**
 * Get a user's current mode
 * @param userId The Telegram user ID
 * @returns The user's current mode, or null if not set
 */
export declare const getUserMode: (userId: number) => UserState["mode"];
/**
 * Update a user's last activity timestamp
 * @param userId The Telegram user ID
 */
export declare const updateUserActivity: (userId: number) => void;
/**
 * Get all users with their current states
 * @returns A map of user IDs to their states
 */
export declare const getAllUserStates: () => Map<number, UserState>;
/**
 * Clear inactive users (optional, for memory management)
 * @param maxInactiveTime Maximum inactive time in milliseconds before clearing state
 */
export declare const clearInactiveUsers: (maxInactiveTime?: number) => void;
