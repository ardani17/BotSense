"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeResolveUserPath = exports.isPathWithinUserDirectory = exports.ensureFeatureDirectory = exports.ensureUserDataDirectory = void 0;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
/**
 * Utility functions for handling user data isolation and file operations
 */
/**
 * Ensures that a user's data directory exists
 * @param basePath The base data path from environment variables
 * @param userId The Telegram user ID
 * @returns The full path to the user's data directory
 */
const ensureUserDataDirectory = (basePath, userId) => {
    const userDir = path.join(basePath, userId.toString());
    fs.ensureDirSync(userDir);
    return userDir;
};
exports.ensureUserDataDirectory = ensureUserDataDirectory;
/**
 * Ensures that a feature-specific directory exists within a user's data directory
 * @param basePath The base data path from environment variables
 * @param userId The Telegram user ID
 * @param featureDir The feature-specific directory name
 * @returns The full path to the feature-specific directory
 */
const ensureFeatureDirectory = (basePath, userId, featureDir) => {
    const userDir = (0, exports.ensureUserDataDirectory)(basePath, userId);
    const featurePath = path.join(userDir, featureDir);
    fs.ensureDirSync(featurePath);
    return featurePath;
};
exports.ensureFeatureDirectory = ensureFeatureDirectory;
/**
 * Validates that a file path is within a user's data directory
 * @param basePath The base data path from environment variables
 * @param userId The Telegram user ID
 * @param filePath The file path to validate
 * @returns True if the file path is within the user's data directory, false otherwise
 */
const isPathWithinUserDirectory = (basePath, userId, filePath) => {
    const userDir = path.join(basePath, userId.toString());
    const normalizedUserDir = path.normalize(userDir);
    const normalizedFilePath = path.normalize(filePath);
    return normalizedFilePath.startsWith(normalizedUserDir);
};
exports.isPathWithinUserDirectory = isPathWithinUserDirectory;
/**
 * Safely resolves a file path within a user's data directory
 * @param basePath The base data path from environment variables
 * @param userId The Telegram user ID
 * @param relativePath The relative path within the user's data directory
 * @returns The full resolved path if it's within the user's data directory, null otherwise
 */
const safeResolveUserPath = (basePath, userId, relativePath) => {
    const userDir = path.join(basePath, userId.toString());
    const resolvedPath = path.resolve(userDir, relativePath);
    if ((0, exports.isPathWithinUserDirectory)(basePath, userId, resolvedPath)) {
        return resolvedPath;
    }
    return null;
};
exports.safeResolveUserPath = safeResolveUserPath;
//# sourceMappingURL=file-utils.js.map