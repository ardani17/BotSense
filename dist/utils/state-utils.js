"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearInactiveUsers = exports.getAllUserStates = exports.updateUserActivity = exports.getUserMode = exports.setUserMode = exports.initUserState = void 0;
// In-memory state storage
const userStates = new Map();
/**
 * Initialize a user's state
 * @param userId The Telegram user ID
 */
const initUserState = (userId) => {
    if (!userStates.has(userId)) {
        userStates.set(userId, {
            mode: null,
            lastActivity: Date.now()
        });
    }
};
exports.initUserState = initUserState;
/**
 * Set a user's mode
 * @param userId The Telegram user ID
 * @param mode The mode to set
 */
const setUserMode = (userId, mode) => {
    const currentState = userStates.get(userId) || { mode: null, lastActivity: Date.now() };
    userStates.set(userId, {
        ...currentState,
        mode,
        lastActivity: Date.now()
    });
};
exports.setUserMode = setUserMode;
/**
 * Get a user's current mode
 * @param userId The Telegram user ID
 * @returns The user's current mode, or null if not set
 */
const getUserMode = (userId) => {
    return userStates.get(userId)?.mode || null;
};
exports.getUserMode = getUserMode;
/**
 * Update a user's last activity timestamp
 * @param userId The Telegram user ID
 */
const updateUserActivity = (userId) => {
    const currentState = userStates.get(userId);
    if (currentState) {
        userStates.set(userId, {
            ...currentState,
            lastActivity: Date.now()
        });
    }
};
exports.updateUserActivity = updateUserActivity;
/**
 * Get all users with their current states
 * @returns A map of user IDs to their states
 */
const getAllUserStates = () => {
    return new Map(userStates);
};
exports.getAllUserStates = getAllUserStates;
/**
 * Clear inactive users (optional, for memory management)
 * @param maxInactiveTime Maximum inactive time in milliseconds before clearing state
 */
const clearInactiveUsers = (maxInactiveTime = 24 * 60 * 60 * 1000) => {
    const now = Date.now();
    for (const [userId, state] of userStates.entries()) {
        if (now - state.lastActivity > maxInactiveTime) {
            userStates.delete(userId);
        }
    }
};
exports.clearInactiveUsers = clearInactiveUsers;
//# sourceMappingURL=state-utils.js.map