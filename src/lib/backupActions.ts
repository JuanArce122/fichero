import { db } from '../db/db';
import { getSettings, updateSettings } from '../db/repo';
import { backupFileName, createBackup, serializeBackup } from './backup';
import { saveFile, type SaveResult } from './share';

/** Genera el respaldo y lo entrega (hoja de compartir o descarga). */
export async function exportBackupNow(includeImages?: boolean): Promise<SaveResult> {
  const settings = await getSettings();
  const backup = await createBackup(db, { includeImages: includeImages ?? settings.includePhotosInBackup });
  const file = new File([serializeBackup(backup)], backupFileName(), { type: 'application/json' });
  const result = await saveFile(file);
  if (result !== 'cancelled') await updateSettings({ lastBackupAt: Date.now() });
  return result;
}

export function backupResultMessage(r: SaveResult): string {
  if (r === 'shared') return 'Respaldo listo. Elige “Guardar en Archivos” → iCloud Drive.';
  if (r === 'downloaded') return 'Respaldo descargado.';
  return 'Respaldo cancelado.';
}
