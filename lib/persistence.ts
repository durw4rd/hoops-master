/**
 * State persistence utilities for localStorage
 * Handles user-specific storage keys, serialization, and error handling
 */

// Storage key prefix to avoid conflicts
const STORAGE_PREFIX = 'summer-hoops';

/**
 * Generate a user-specific storage key
 */
export function getStorageKey(userId: string, feature: string, filter?: string): string {
  const baseKey = `${STORAGE_PREFIX}-${userId}-${feature}`;
  return filter ? `${baseKey}-${filter}` : baseKey;
}

/**
 * Save data to localStorage with error handling
 */
export function saveToStorage<T>(key: string, data: T): boolean {
  try {
    const serialized = JSON.stringify(data);
    localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    console.warn('Failed to save to localStorage:', error);
    return false;
  }
}

/**
 * Load data from localStorage with error handling and default fallback
 */
export function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (item === null) {
      return defaultValue;
    }
    
    const parsed = JSON.parse(item);
    return parsed as T;
  } catch (error) {
    console.warn('Failed to load from localStorage:', error);
    return defaultValue;
  }
}

/**
 * Remove data from localStorage
 */
export function removeFromStorage(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn('Failed to remove from localStorage:', error);
    return false;
  }
}

/**
 * Clear all summer-hoops related data for a specific user
 */
export function clearUserData(userId: string): boolean {
  try {
    const keysToRemove: string[] = [];
    
    // Find all keys for this user
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${STORAGE_PREFIX}-${userId}-`)) {
        keysToRemove.push(key);
      }
    }
    
    // Remove all found keys
    keysToRemove.forEach(key => localStorage.removeItem(key));
    return true;
  } catch (error) {
    console.warn('Failed to clear user data:', error);
    return false;
  }
}

/**
 * Check if localStorage is available and working
 */
export function isStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get storage usage information (for debugging)
 */
export function getStorageInfo(): { used: number; available: number; percentage: number } {
  try {
    let used = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        used += localStorage.getItem(key)?.length || 0;
      }
    }
    
    // Approximate available space (varies by browser)
    const available = 5 * 1024 * 1024; // 5MB estimate
    const percentage = (used / available) * 100;
    
    return { used, available, percentage };
  } catch {
    return { used: 0, available: 0, percentage: 0 };
  }
}

/**
 * Type definitions for persisted state
 */
export interface PersistedState {
  activeTab: string;
  scheduleFilters: {
    showAll: boolean;
    showPast: boolean;
    condensedMode: boolean;
  };
  availableFilters: {
    showAllActive: boolean;
    showMine: boolean;
    showInactive: boolean;
    selectedEvents: string[]; // Converted from Set
  };
}

/**
 * Default values for persisted state
 */
export const DEFAULT_PERSISTED_STATE: PersistedState = {
  activeTab: 'schedule',
  scheduleFilters: {
    showAll: false,
    showPast: false,
    condensedMode: false,
  },
  availableFilters: {
    showAllActive: true,
    showMine: false,
    showInactive: false,
    selectedEvents: ['all'],
  },
}; 