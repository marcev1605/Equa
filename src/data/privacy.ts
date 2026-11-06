import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'equa-hide-v1';

/** ¿Quedaron ocultos los saldos la última vez? (se guarda en este dispositivo) */
export async function loadHide(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(KEY)) === '1'; } catch { return false; }
}

export async function saveHide(on: boolean): Promise<void> {
  try { await AsyncStorage.setItem(KEY, on ? '1' : '0'); } catch { /* sin almacenamiento: vale solo en esta sesión */ }
}
