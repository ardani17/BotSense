/**
 * Utility functions for handling user data isolation and file operations
 */
/**
 * Ensures that a user's data directory exists
 * @param basePath The base data path from environment variables
 * @param userId The Telegram user ID
 * @returns The full path to the user's data directory
 */
export declare const ensureUserDataDirectory: (basePath: string, userId: number) => string;
/**
 * Ensures that a feature-specific directory exists within a user's data directory
 * @param basePath The base data path from environment variables
 * @param userId The Telegram user ID
 * @param featureDir The feature-specific directory name
 * @returns The full path to the feature-specific directory
 */
export declare const ensureFeatureDirectory: (basePath: string, userId: number, featureDir: string) => string;
/**
 * Validates that a file path is within a user's data directory
 * @param basePath The base data path from environment variables
 * @param userId The Telegram user ID
 * @param filePath The file path to validate
 * @returns True if the file path is within the user's data directory, false otherwise
 */
export declare const isPathWithinUserDirectory: (basePath: string, userId: number, filePath: string) => boolean;
/**
 * Safely resolves a file path within a user's data directory
 * @param basePath The base data path from environment variables
 * @param userId The Telegram user ID
 * @param relativePath The relative path within the user's data directory
 * @returns The full resolved path if it's within the user's data directory, null otherwise
 */
export declare const safeResolveUserPath: (basePath: string, userId: number, relativePath: string) => string | null;
