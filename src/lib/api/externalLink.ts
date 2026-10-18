import { open } from '@tauri-apps/plugin-shell';
import { commands } from '@/generated/bindings';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';

/**
 * Opens a web link in the system browser. The desktop keeps the shell plugin's
 * JS `open`; in the touch shell that one starts a helper process, which iOS
 * does not allow, so it goes through `open_external_url` (the plugin's native
 * mobile path) instead.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!IS_MOBILE_SHELL) return open(url);
  const res = await commands.openExternalUrl(url);
  if (res.status === 'error') throw new Error(res.error);
}
