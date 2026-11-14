/**
 * Prepares an HTML5 canvas for crisp HiDPI / Retina rendering at window.devicePixelRatio.
 * Sets backing store dimensions in device pixels and resets the 2D context transform
 * so all drawing calls use logical CSS pixel coordinates (cssWidth x cssHeight).
 */
export function prepareHiDpiCanvas(canvas, cssWidth, cssHeight) {
  if (!canvas) return null;
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2.5);
  const targetW = Math.round(cssWidth * dpr);
  const targetH = Math.round(cssHeight * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: cssWidth, height: cssHeight, dpr };
}
