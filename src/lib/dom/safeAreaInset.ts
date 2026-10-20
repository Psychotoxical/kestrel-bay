/**
 * The bottom safe-area inset in CSS px: the iPhone's home indicator, Android's navigation
 * bar in an edge-to-edge window. 0 on the desktop.
 */
export function safeAreaInsetBottom(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom, 0px)';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return px;
}
