import { create } from 'zustand';

// A promise-based global confirm / prompt dialog, so a call site is one
// line - `if (await confirm({ title, message })) ...` - instead of local
// open/target state, and every one of them is the same small themed popup
// (see GlobalDialog.tsx) rather than the browser's native window.confirm /
// window.prompt.

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions extends ConfirmOptions {
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  // Return a string to show an inline error and keep the dialog open.
  validate?: (value: string) => string | null;
  required?: boolean;
}

type DialogState =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }
  | null;

interface DialogStore {
  current: DialogState;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
  resolveConfirm: (v: boolean) => void;
  resolvePrompt: (v: string | null) => void;
}

export const useDialogStore = create<DialogStore>((set, get) => ({
  current: null,
  confirm: (opts) =>
    new Promise<boolean>((resolve) => {
      set({ current: { kind: 'confirm', opts, resolve } });
    }),
  prompt: (opts) =>
    new Promise<string | null>((resolve) => {
      set({ current: { kind: 'prompt', opts, resolve } });
    }),
  resolveConfirm: (v) => {
    const cur = get().current;
    if (cur?.kind === 'confirm') cur.resolve(v);
    set({ current: null });
  },
  resolvePrompt: (v) => {
    const cur = get().current;
    if (cur?.kind === 'prompt') cur.resolve(v);
    set({ current: null });
  },
}));

// Convenience free functions for call sites that are not React components
// (event handlers, mutation fns). They read the store imperatively.
export const confirmDialog = (opts: ConfirmOptions) => useDialogStore.getState().confirm(opts);
export const promptDialog = (opts: PromptOptions) => useDialogStore.getState().prompt(opts);
