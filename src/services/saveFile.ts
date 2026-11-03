import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** iPhone y Android: guarda el archivo en la caché de la app y abre el menú de compartir (Archivos, Drive, WhatsApp, mail…). */
export async function saveFile(name: string, bytes: Uint8Array, mime: string): Promise<'shared' | 'downloaded'> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este dispositivo no permite compartir archivos');
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
  return 'shared';
}
