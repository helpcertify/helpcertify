import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseTypewriterOptions {
  typingSpeedMs?: number;
  deletingSpeedMs?: number;
  pauseAfterCompleteMs?: number;
  pauseBeforeNextMs?: number;
  /** false = reduced motion: show the active phrase fully, no animation. */
  enabled?: boolean;
}

type Phase = 'typing' | 'deleting';

// A minimal, dependency-free typewriter loop: type a phrase, hold, delete
// it, move to the next, repeat. Exactly one timer is ever pending - each
// effect run clears the previous timeout before scheduling the next, and
// the cleanup function (returned from the effect) clears it again on
// unmount/re-run, so this can't leak timers or stack concurrent loops.
export function useTypewriter(phrases: string[], options: UseTypewriterOptions = {}) {
  const {
    typingSpeedMs = 62,
    deletingSpeedMs = 35,
    pauseAfterCompleteMs = 2000,
    pauseBeforeNextMs = 300,
    enabled = true,
  } = options;

  const [activeIndex, setActiveIndexState] = useState(0);
  const [displayedText, setDisplayedText] = useState(() => (enabled ? '' : (phrases[0] ?? '')));
  const [phase, setPhase] = useState<Phase>('typing');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // A pill click jumps straight to that phrase and restarts the type-in,
  // rather than waiting for the current phrase to finish its cycle.
  const setActiveIndex = useCallback(
    (index: number) => {
      clearTimer();
      setActiveIndexState(index);
      if (enabled) {
        setDisplayedText('');
        setPhase('typing');
      } else {
        setDisplayedText(phrases[index] ?? '');
      }
    },
    [clearTimer, enabled, phrases],
  );

  useEffect(() => {
    if (!enabled || phrases.length === 0) return undefined;
    const current = phrases[activeIndex] ?? '';

    if (phase === 'typing') {
      if (displayedText.length < current.length) {
        timeoutRef.current = setTimeout(() => {
          setDisplayedText(current.slice(0, displayedText.length + 1));
        }, typingSpeedMs);
      } else {
        // Fully typed - hold on screen, then start deleting.
        timeoutRef.current = setTimeout(() => setPhase('deleting'), pauseAfterCompleteMs);
      }
    } else {
      if (displayedText.length > 0) {
        timeoutRef.current = setTimeout(() => {
          setDisplayedText(current.slice(0, displayedText.length - 1));
        }, deletingSpeedMs);
      } else {
        // Fully deleted - brief pause, then advance and start typing again.
        timeoutRef.current = setTimeout(() => {
          setActiveIndexState((i) => (i + 1) % phrases.length);
          setPhase('typing');
        }, pauseBeforeNextMs);
      }
    }

    return clearTimer;
  }, [phase, displayedText, activeIndex, enabled, phrases, typingSpeedMs, deletingSpeedMs, pauseAfterCompleteMs, pauseBeforeNextMs, clearTimer]);

  // If the caller flips `enabled` off mid-animation (reduced-motion turned
  // on live), snap straight to the full current phrase instead of freezing
  // mid-type/-delete.
  useEffect(() => {
    if (!enabled) {
      clearTimer();
      setDisplayedText(phrases[activeIndex] ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { displayedText, activeIndex, setActiveIndex, isAnimating: enabled };
}
