/**
 * ⚠️ Android territory. The app draws behind the status and navigation bars; their icons
 * must suit the theme (light icons on a dark theme, dark icons on a light one). Samsung
 * picks that up itself, other makers (Honor / MagicOS) keep the system default and leave
 * dark icons on a dark app. The theme's background tells the activity which to use
 * (`PsysonicAndroidShell.setDarkBackground`, `src-tauri/android/MainActivity.kt`).
 */
import { IS_ANDROID } from '@/lib/util/platform';

interface AndroidShellHost {
  setDarkBackground(dark: boolean): void;
  /** See `androidNetwork.ts`. */
  isMetered?(): boolean;
  /** See `mobileShell/utils/landscape.ts`. */
  allowLandscape?(allowed: boolean): void;
  /** See `androidBack.ts`. */
  setOverlayOpen?(open: boolean): void;
}

declare global {
  interface Window {
    PsysonicAndroidShell?: AndroidShellHost;
  }
}

/** Relative luminance of a CSS `rgb()` / `rgba()` colour; null when it cannot be read. */
export function luminanceOf(color: string): number | null {
  const parts = color.match(/[\d.]+/g)?.map(Number);
  if (!parts || parts.length < 3) return null;
  const [r, g, b] = parts.slice(0, 3).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Whether the active theme's app background is dark. */
export function themeBackgroundIsDark(): boolean {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;background-color:var(--bg-app)';
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const luminance = luminanceOf(color);
  return luminance === null ? true : luminance < 0.4;
}

/** Reports the theme now and on every theme change. Returns the cleanup. */
export function installAndroidSystemBars(): () => void {
  if (!IS_ANDROID) return () => {};
  let last: boolean | null = null;
  const report = () => {
    const dark = themeBackgroundIsDark();
    if (dark === last) return;
    last = dark;
    window.PsysonicAndroidShell?.setDarkBackground(dark);
  };
  report();
  const observer = new MutationObserver(() => requestAnimationFrame(report));
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
  return () => observer.disconnect();
}
