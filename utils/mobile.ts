
/**
 * Mobile Device Haptic Feedback Utility
 * Uses navigator.vibrate for web/android fallback.
 * Can be upgraded to use @capacitor/haptics for better iOS support.
 */
export const triggerHaptic = (style: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'medium') => {
  // Check if navigator.vibrate is supported (Most Android browsers & WebViews)
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    switch (style) {
      case 'light':
        navigator.vibrate(10); // Short tick
        break;
      case 'medium':
        navigator.vibrate(20); // Normal click feel
        break;
      case 'heavy':
        navigator.vibrate(40); // Strong impact
        break;
      case 'success':
        navigator.vibrate([10, 30, 10]); // Double tap
        break;
      case 'error':
        navigator.vibrate([50, 50, 50]); // Triple buzz
        break;
    }
  }
};
