import confetti from 'canvas-confetti';

/**
 * Launches celebratory confetti when running in a browser with canvas 2D support.
 */
export function triggerCelebration() {
  if (typeof document === 'undefined') {
    return;
  }
  const probeCanvas = document.createElement('canvas');
  if (typeof probeCanvas.getContext !== 'function') {
    return;
  }
  try {
    if (!probeCanvas.getContext('2d')) {
      return;
    }
    confetti({
      particleCount: 70,
      spread: 65,
      origin: { y: 0.6 },
      colors: ['#091b3f', '#1f4e79', '#92845c', '#d4af37'],
      disableForReducedMotion: true,
    });
  } catch {
    // jsdom does not implement canvas 2D context; skip visual confetti in tests.
  }
}
