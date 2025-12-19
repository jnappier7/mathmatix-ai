/**
 * Safe Storage Utilities
 * Provides error-safe access to localStorage and sessionStorage
 * Handles Safari's Tracking Prevention and other storage blocking scenarios
 */

const StorageUtils = (() => {
  // Test if storage is available and accessible
  function isStorageAvailable(type) {
    try {
      const storage = window[type];
      const testKey = '__storage_test__';
      storage.setItem(testKey, 'test');
      storage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Cache availability checks to avoid repeated testing
  let localStorageAvailable = null;
  let sessionStorageAvailable = null;

  function checkLocalStorage() {
    if (localStorageAvailable === null) {
      localStorageAvailable = isStorageAvailable('localStorage');
    }
    return localStorageAvailable;
  }

  function checkSessionStorage() {
    if (sessionStorageAvailable === null) {
      sessionStorageAvailable = isStorageAvailable('sessionStorage');
    }
    return sessionStorageAvailable;
  }

  // LocalStorage safe methods
  const safeLocalStorage = {
    setItem(key, value) {
      try {
        if (checkLocalStorage()) {
          localStorage.setItem(key, value);
          return true;
        } else {
          console.warn(`[Storage] localStorage blocked for key: ${key}`);
          return false;
        }
      } catch (error) {
        console.error(`[Storage] Failed to set localStorage key "${key}":`, error);
        return false;
      }
    },

    getItem(key) {
      try {
        if (checkLocalStorage()) {
          return localStorage.getItem(key);
        } else {
          console.warn(`[Storage] localStorage blocked for key: ${key}`);
          return null;
        }
      } catch (error) {
        console.error(`[Storage] Failed to get localStorage key "${key}":`, error);
        return null;
      }
    },

    removeItem(key) {
      try {
        if (checkLocalStorage()) {
          localStorage.removeItem(key);
          return true;
        } else {
          console.warn(`[Storage] localStorage blocked for key: ${key}`);
          return false;
        }
      } catch (error) {
        console.error(`[Storage] Failed to remove localStorage key "${key}":`, error);
        return false;
      }
    },

    clear() {
      try {
        if (checkLocalStorage()) {
          localStorage.clear();
          return true;
        } else {
          console.warn('[Storage] localStorage blocked for clear operation');
          return false;
        }
      } catch (error) {
        console.error('[Storage] Failed to clear localStorage:', error);
        return false;
      }
    }
  };

  // SessionStorage safe methods
  const safeSessionStorage = {
    setItem(key, value) {
      try {
        if (checkSessionStorage()) {
          sessionStorage.setItem(key, value);
          return true;
        } else {
          console.warn(`[Storage] sessionStorage blocked for key: ${key}`);
          return false;
        }
      } catch (error) {
        console.error(`[Storage] Failed to set sessionStorage key "${key}":`, error);
        return false;
      }
    },

    getItem(key) {
      try {
        if (checkSessionStorage()) {
          return sessionStorage.getItem(key);
        } else {
          console.warn(`[Storage] sessionStorage blocked for key: ${key}`);
          return null;
        }
      } catch (error) {
        console.error(`[Storage] Failed to get sessionStorage key "${key}":`, error);
        return null;
      }
    },

    removeItem(key) {
      try {
        if (checkSessionStorage()) {
          sessionStorage.removeItem(key);
          return true;
        } else {
          console.warn(`[Storage] sessionStorage blocked for key: ${key}`);
          return false;
        }
      } catch (error) {
        console.error(`[Storage] Failed to remove sessionStorage key "${key}":`, error);
        return false;
      }
    },

    clear() {
      try {
        if (checkSessionStorage()) {
          sessionStorage.clear();
          return true;
        } else {
          console.warn('[Storage] sessionStorage blocked for clear operation');
          return false;
        }
      } catch (error) {
        console.error('[Storage] Failed to clear sessionStorage:', error);
        return false;
      }
    }
  };

  // Public API
  return {
    local: safeLocalStorage,
    session: safeSessionStorage,
    isLocalStorageAvailable: checkLocalStorage,
    isSessionStorageAvailable: checkSessionStorage
  };
})();

// Make available globally
window.StorageUtils = StorageUtils;
