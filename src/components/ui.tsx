import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
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
export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

type ToastFn = (msg: string, action?: ToastAction) => void;

const ToastContext = createContext<ToastFn>(() => {});

export function UIProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [toast, setToast] = useState<{ msg: string; action?: ToastAction } | null>(null);
  const timer = useRef<number>(undefined);

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise((resolve) => setPending({ ...opts, resolve })),
    [],
  );

  const showToast = useCallback<ToastFn>((msg, action) => {
    setToast({ msg, action });
    window.clearTimeout(timer.current);
    // Con acción (Deshacer) se deja más tiempo para reaccionar.
    timer.current = window.setTimeout(() => setToast(null), action ? 5000 : 2600);
  }, []);

  // Un aviso informativo no debe seguir a otra pantalla (los de "Deshacer" sí).
  const { pathname } = useLocation();
  useEffect(() => {
    setToast((t) => (t?.action ? t : null));
  }, [pathname]);

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
          <div className={`toast${toast.action ? ' with-action' : ''}`} role="status">
            <span>{toast.msg}</span>
            {toast.action && (
              <button
                className="toast-action"
                onClick={() => {
                  const run = toast.action!.run;
                  setToast(null);
                  run();
                }}
              >
                {toast.action.label}
              </button>
            )}
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
