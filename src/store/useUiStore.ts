import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'info';
}

interface UiState {
  toasts: Toast[];
  pushToast: (message: string, variant?: Toast['variant']) => void;
  dismissToast: (id: string) => void;
}

// Global, cross-feature UI state. Feature-local state (e.g. auth's session)
// lives inside that feature's own store instead of here.
export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  pushToast: (message, variant = 'info') =>
    set((state) => ({ toasts: [...state.toasts, { id: crypto.randomUUID(), message, variant }] })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
