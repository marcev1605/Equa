import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'equa-last-backup-v1';

/** Fecha y hora (local, "AAAA-MM-DDTHH:mm") del último respaldo manual guardado en este dispositivo, o null si nunca se hizo. */
export async function lastBackup(): Promise<string | null> {
  try { return (await AsyncStorage.getItem(KEY)) || null; } catch { return null; }
}

/** Anota que se acaba de guardar un respaldo manual. */
export async function markBackup(d: Date = new Date()): Promise<string> {
  const p = (n: number) => String(n).padStart(2, '0');
  const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  try { await AsyncStorage.setItem(KEY, iso); } catch { /* sin almacenamiento: solo se muestra en esta sesión */ }
  return iso;
}
