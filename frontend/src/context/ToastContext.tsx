/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2026 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import {createContext, useContext, useState, useCallback, type ReactNode} from 'react';
import {X, CheckCircle2, AlertCircle, Info, Bell} from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastValue {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastValue>({
  toasts: [],
  addToast: () => {
  },
  removeToast: () => {
  },
});

export const useToast = () => useContext(ToastContext);

interface ToastProviderProps {
  children: ReactNode;
}

function ToastItem({toast, onRemove}: { toast: Toast; onRemove: (id: string) => void }) {
  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="h-4 w-4 text-emerald-500"/>,
    error: <AlertCircle className="h-4 w-4 text-red-500"/>,
    info: <Info className="h-4 w-4 text-blue-500"/>,
    warning: <Bell className="h-4 w-4 text-amber-500"/>,
  };

  const borders: Record<ToastType, string> = {
    success: 'border-l-emerald-500',
    error: 'border-l-red-500',
    info: 'border-l-blue-500',
    warning: 'border-l-amber-500',
  };

  const bgClass = `dark:bg-slate-800/90 dark:border-slate-700/60 border border-gray-200 bg-white`;

  return (
    <div
      className={`${borders[toast.type]} ${bgClass} backdrop-blur-md rounded-xl px-4 py-3 shadow-lg animate-fade-in flex items-center gap-3 min-w-[280px] max-w-[380px]`}>
      {icons[toast.type]}
      <p className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200">{toast.message}</p>
      <button onClick={() => onRemove(toast.id)} className="text-gray-300 transition-colors hover:text-gray-500">
        <X className="h-4 w-4"/>
      </button>
    </div>
  );
}

export function ToastProvider({children}: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(prev => [...prev, {id, message, type}]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{toasts, addToast, removeToast}}>
      {children}
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-2" aria-live="polite">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={removeToast}/>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
