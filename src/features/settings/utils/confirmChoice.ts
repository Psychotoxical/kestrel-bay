import { IS_MOBILE_SHELL } from '@/lib/util/platform';
import { useConfirmModalStore } from '@/store/confirmModalStore';

export interface ConfirmChoice {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
}

/**
 * A yes/no question before a settings action. Desktop keeps the browser dialog
 * it always had (only the message shows there); the touch shell uses the app's
 * own confirm dialog, since a WKWebView `confirm()` depends on the host
 * implementing it and could otherwise answer "no" without asking.
 */
export async function confirmChoice(choice: ConfirmChoice): Promise<boolean> {
  if (!IS_MOBILE_SHELL) return window.confirm(choice.message);
  return useConfirmModalStore.getState().request(choice);
}
