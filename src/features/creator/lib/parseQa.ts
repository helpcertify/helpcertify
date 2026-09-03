// Light client-side parser for the Q&A text format creators paste into the
// Content Studio (PRD 9B, doc-upload-only decision). Heavy .docx extraction
// stays admin-side; this handles pasted plain text:
//
//   1. What is the CIA triad?
//   A. Confidentiality, Integrity, Availability
//   B. ...
//   Answer: A
//   Explanation: The CIA triad is ...
//
// Returns structured items + per-block errors so the creator can fix them
// before submitting.

export interface ParsedItem {
  stem: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface ParseResult {
  items: ParsedItem[];
  errors: { block: number; message: string }[];
}

const Q_RE = /^\s*(?:Q?\d+[.)]|Q[:.]?)\s*/i;
const OPT_RE = /^\s*([A-H])[.)]\s*(.+)$/;
const ANS_RE = /^\s*(?:Answer|Ans|Correct)\s*[:.]?\s*(.+)$/i;
const EXP_RE = /^\s*(?:Explanation|Rationale|Why)\s*[:.]?\s*(.*)$/i;

export function parseQaText(text: string): ParseResult {
  const items: ParsedItem[] = [];
  const errors: { block: number; message: string }[] = [];

  // Split into blocks on blank lines OR on a new numbered question.
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (Q_RE.test(line) && cur.some((l) => l.trim())) {
      blocks.push(cur);
      cur = [line];
    } else if (line.trim() === '' && cur.some((l) => l.trim())) {
      blocks.push(cur);
      cur = [];
    } else {
      cur.push(line);
    }
  }
  if (cur.some((l) => l.trim())) blocks.push(cur);

  blocks.forEach((block, i) => {
    const raw = block.map((l) => l.trimEnd());
    let stem = '';
    const options: string[] = [];
    let answer = '';
    let explanation = '';
    let mode: 'stem' | 'exp' = 'stem';

    for (const line of raw) {
      const opt = line.match(OPT_RE);
      const ans = line.match(ANS_RE);
      const exp = line.match(EXP_RE);
      if (exp) {
        explanation = exp[1] ?? '';
        mode = 'exp';
      } else if (ans) {
        answer = ans[1].trim();
      } else if (opt) {
        options.push(opt[2].trim());
      } else if (mode === 'exp') {
        explanation += (explanation ? ' ' : '') + line.trim();
      } else {
        stem += (stem ? ' ' : '') + line.replace(Q_RE, '').trim();
      }
    }

    if (!stem) {
      errors.push({ block: i + 1, message: 'No question text found.' });
      return;
    }
    if (options.length < 2) {
      errors.push({ block: i + 1, message: 'Need at least two options (A., B., ...).' });
      return;
    }
    if (!answer) {
      errors.push({ block: i + 1, message: 'No "Answer:" line found.' });
      return;
    }
    // Resolve a letter answer to the option text.
    const letter = answer.trim().toUpperCase();
    if (/^[A-H]$/.test(letter)) {
      const idx = letter.charCodeAt(0) - 65;
      if (idx >= options.length) {
        errors.push({ block: i + 1, message: `Answer "${letter}" has no matching option.` });
        return;
      }
      answer = options[idx];
    } else if (!options.includes(answer)) {
      errors.push({ block: i + 1, message: 'Answer does not match any option text.' });
      return;
    }

    items.push({ stem: stem.trim(), options, answer, explanation: explanation.trim() });
  });

  return { items, errors };
}
