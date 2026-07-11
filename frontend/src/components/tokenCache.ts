import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const webTokenCache = {
  async getToken(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    localStorage.setItem(key, value);
  },
};

const nativeTokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      await SecureStore.deleteItemAsync(key);
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

export const tokenCache = Platform.OS === 'web' ? webTokenCache : nativeTokenCache;
