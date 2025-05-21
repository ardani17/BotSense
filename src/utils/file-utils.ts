import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Utility functions for handling user data isolation and file operations
 */

/**
 * Ensures that a user's data directory exists
 * @param basePath The base data path from environment variables
 * @param userId The Telegram user ID
 * @returns The full path to the user's data directory
 */
export const ensureUserDataDirectory = (basePath: string, userId: number): string => {
  const userDir = path.join(basePath, userId.toString());
  fs.ensureDirSync(userDir);
  return userDir;
};

/**
 * Ensures that a feature-specific directory exists within a user's data directory
 * @param basePath The base data path from environment variables
 * @param userId The Telegram user ID
 * @param featureDir The feature-specific directory name
 * @returns The full path to the feature-specific directory
 */
export const ensureFeatureDirectory = (basePath: string, userId: number, featureDir: string): string => {
  const userDir = ensureUserDataDirectory(basePath, userId);
  const featurePath = path.join(userDir, featureDir);
  fs.ensureDirSync(featurePath);
  return featurePath;
};

/**
 * Validates that a file path is within a user's data directory
 * @param basePath The base data path from environment variables
 * @param userId The Telegram user ID
 * @param filePath The file path to validate
 * @returns True if the file path is within the user's data directory, false otherwise
 */
export const isPathWithinUserDirectory = (basePath: string, userId: number, filePath: string): boolean => {
  const userDir = path.join(basePath, userId.toString());
  const normalizedUserDir = path.normalize(userDir);
  const normalizedFilePath = path.normalize(filePath);
  
  return normalizedFilePath.startsWith(normalizedUserDir);
};

/**
 * Safely resolves a file path within a user's data directory
 * @param basePath The base data path from environment variables
 * @param userId The Telegram user ID
 * @param relativePath The relative path within the user's data directory
 * @returns The full resolved path if it's within the user's data directory, null otherwise
 */
export const safeResolveUserPath = (basePath: string, userId: number, relativePath: string): string | null => {
  const userDir = path.join(basePath, userId.toString());
  const resolvedPath = path.resolve(userDir, relativePath);
  
  if (isPathWithinUserDirectory(basePath, userId, resolvedPath)) {
    return resolvedPath;
  }
  
  return null;
};
