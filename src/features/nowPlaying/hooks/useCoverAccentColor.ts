import { useEffect, useState } from 'react';

// Samples a 16×16 canvas to find the most vibrant (highest-saturation,
// medium-dark) pixel. Returns an "R, G, B" string for use in rgba().
function extractVibrantColor(imageUrl: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve('0,0,0'); return; }
      ctx.drawImage(img, 0, 0, 16, 16);
      const { data } = ctx.getImageData(0, 0, 16, 16);
      let bestR = 0, bestG = 0, bestB = 0, bestScore = -1;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b) / 255;
        const min = Math.min(r, g, b) / 255;
        const l = (max + min) / 2;
        const s = max === min ? 0 : (max - min) / (l > 0.5 ? 2 - max - min : max + min);
        // Prefer saturated pixels in the medium-dark range (l 0.2–0.6)
        const score = s * (1 - Math.abs(l - 0.4));
        if (score > bestScore) {
          bestScore = score;
          bestR = r; bestG = g; bestB = b;
        }
      }
      resolve(`${bestR},${bestG},${bestB}`);
    };
    img.onerror = () => resolve('0,0,0');
    img.src = imageUrl;
  });
}

/** Most vibrant colour of the cover as an "R, G, B" string; "0,0,0" without a cover. */
export function useCoverAccentColor(imageUrl: string): string {
  const [color, setColor] = useState('0,0,0');
  useEffect(() => {
    // React Compiler set-state-in-effect rule: state set from a DOM/layout measurement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!imageUrl) { setColor('0,0,0'); return; }
    let cancelled = false;
    extractVibrantColor(imageUrl).then(c => { if (!cancelled) setColor(c); });
    return () => { cancelled = true; };
  }, [imageUrl]);
  return color;
}
