import { create } from 'zustand';

export interface MobileActionSheetAction {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
}

interface MobileActionSheetRequest {
  title: string;
  message?: string;
  actions: MobileActionSheetAction[];
}

interface MobileActionSheetState extends MobileActionSheetRequest {
  isOpen: boolean;
  /** Opens the sheet; resolves with the chosen action id, or `null` when it was closed. */
  request: (req: MobileActionSheetRequest) => Promise<string | null>;
  choose: (id: string | null) => void;
}

let resolvePending: ((id: string | null) => void) | null = null;

/**
 * Touch shell: a question with a few answers, as a bottom sheet (rendered once
 * by `MobileActionSheet`). Closing the sheet is the "not now" answer.
 */
export const useMobileActionSheetStore = create<MobileActionSheetState>(set => ({
  isOpen: false,
  title: '',
  message: undefined,
  actions: [],

  request: req => new Promise<string | null>(resolve => {
    // A newer question replaces one still open; the old one counts as closed.
    resolvePending?.(null);
    resolvePending = resolve;
    set({ isOpen: true, message: undefined, ...req });
  }),

  choose: id => {
    resolvePending?.(id);
    resolvePending = null;
    set({ isOpen: false });
  },
}));
