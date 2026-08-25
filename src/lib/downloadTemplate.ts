const TEMPLATES: Record<'standard' | 'cisa_qa', string> = {
  standard: `Standard Template: one question per block, in this exact order.
Save as a .docx (Word) file before uploading.

Q: What is the capital of France?
A) Berlin
B) Paris
C) Madrid
D) Rome
Correct: B

Q: Next question here...
A) ...
B) ...
C) ...
D) ...
Correct: A
`,
  cisa_qa: `CISA Q&A Format: numbered, bold question stems, lettered options.
Save as a .docx (Word) file before uploading. Bold the question line
(the "N. " line) so the parser can find it.

1. What is the capital of France?
A. Berlin
B. Paris
C. Madrid
D. Rome
Answer: B

2. Next question here...
A. ...
B. ...
C. ...
D. ...
Answer: A
`,
};

// A real .docx template would need hand-built Open XML — this plain-text
// version shows the exact syntax the parser expects, which an admin can
// paste into Word and save as .docx. Simpler and far less fragile than
// generating OOXML by hand for a one-off template download.
export function downloadTemplate(format: 'standard' | 'cisa_qa') {
  const blob = new Blob([TEMPLATES[format]], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = format === 'cisa_qa' ? 'cisa-qa-template.txt' : 'standard-template.txt';
  a.click();
  URL.revokeObjectURL(url);
}
