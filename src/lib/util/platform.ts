/** True when running on Linux (WebKitGTK). Used to show the custom title bar. */
export const IS_LINUX = navigator.platform.toLowerCase().includes('linux');
/** True when running on macOS (WKWebView). */
export const IS_MACOS = navigator.platform.toLowerCase().includes('mac');
/** True when running on Windows (WebView2). */
export const IS_WINDOWS = navigator.platform.toLowerCase().includes('win');
/**
 * True in the iOS/Android app build: the touch shell replaces sidebar, header
 * and player bar. A build-time constant, so desktop bundles drop the mobile code.
 */
export const IS_MOBILE_SHELL: boolean = __PSY_MOBILE_SHELL__ === true;
