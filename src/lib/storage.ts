// Almacenamiento persistente: pide al navegador que no borre los datos de la app
// bajo presión de espacio. En iOS, las apps agregadas a la pantalla de inicio
// están exentas de la política de borrado tras 7 días sin uso de Safari.

export interface StorageStatus {
  persisted: boolean | null;
  standalone: boolean;
  usage?: number;
  quota?: number;
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageStatus(): Promise<StorageStatus> {
  const status: StorageStatus = { persisted: null, standalone: isStandalone() };
  try {
    if (navigator.storage?.persisted) status.persisted = await navigator.storage.persisted();
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      status.usage = est.usage;
      status.quota = est.quota;
    }
  } catch {
    /* sin datos */
  }
  return status;
}

export function formatBytes(n?: number): string {
  if (n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
