import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

// ---------- encabezado ----------

export function PageHeader({ title, back, children }: { title: ReactNode; back?: boolean | string; children?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      {back && (
        <button
          className="icon-btn back"
          aria-label="Volver"
          onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
        >
          <Icon name="back" />
        </button>
      )}
      <h1>{title}</h1>
      {children}
    </header>
  );
}

// ---------- hoja modal ----------

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ---------- confirmación ----------

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirm?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);
const ToastContext = createContext<(msg: string) => void>(() => {});

export function UIProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number>(undefined);

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise((resolve) => setPending({ ...opts, resolve })),
    [],
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const close = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      <ToastContext.Provider value={showToast}>
        {children}
        <Sheet open={!!pending} onClose={() => close(false)}>
          {pending && (
            <>
              <h2>{pending.title}</h2>
              {pending.message && <div className="muted">{pending.message}</div>}
              <div className="actions-2">
                <button className="btn" onClick={() => close(false)}>
                  Cancelar
                </button>
                <button className={`btn ${pending.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>
                  {pending.confirm ?? 'Aceptar'}
                </button>
              </div>
            </>
          )}
        </Sheet>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </ToastContext.Provider>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
export const useToast = () => useContext(ToastContext);

// ---------- controles ----------

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
