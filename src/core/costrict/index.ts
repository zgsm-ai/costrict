/**
 * ZGSM Core Module
 *
 * This module provides the core ZGSM functionality including:
 * - Code completion
 * - Code lens providers
 * - Language support
 * - Internationalization
 * - Common utilities
 */

// Re-export all modules
export * from "./completion"
export * from "./codelens"
export * from "./base/common"
export * from "./base/language"

// Export data as a namespace to avoid conflicts
export * as ZgsmData from "./base/data"

// Export activation functions
export * from "./activate"
