// Fisher-Yates. Pure, returns a new array, never mutates the input.
// api/quiz-session.ts re-implements the same 4 lines inline (no imports
// from src/ into api/) to shuffle a mock attempt's question + option
// order; this is the tested reference (shuffle.test.ts).
export function shuffle<T>(input: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
