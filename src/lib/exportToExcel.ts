import ExcelJS from 'exceljs';
import type { AttemptRow } from '@/features/admin/api/resultsApi';

// Runs entirely client-side from data already fetched for the on-screen
// table - no extra Vercel function spent just to generate a file. exceljs
// (not the npm `xlsx` package, which has unpatched prototype-pollution/ReDoS
// advisories on its published registry version) produces a real .xlsx.
export async function exportResultsToExcel(quizTitle: string, rows: AttemptRow[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Results');

  sheet.columns = [
    { header: 'Rank', key: 'rank', width: 8 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Questions', key: 'questions', width: 12 },
    { header: 'Answered', key: 'answered', width: 12 },
    { header: 'Not Answered', key: 'notAnswered', width: 14 },
    { header: 'Incorrect', key: 'incorrect', width: 12 },
    { header: 'Correct', key: 'correct', width: 12 },
    { header: 'Marks', key: 'marks', width: 10 },
    { header: 'Duration (min)', key: 'duration', width: 14 },
    { header: 'Exits', key: 'exits', width: 8 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const r of rows) {
    sheet.addRow({
      rank: r.rank,
      name: r.userName,
      questions: r.totalQuestions,
      answered: r.answeredCount,
      notAnswered: r.notAnsweredCount,
      incorrect: r.incorrectCount,
      correct: r.correctCount,
      marks: r.marks,
      duration: Math.round(r.durationSeconds / 60),
      exits: r.exitCount,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${quizTitle.replace(/[^a-z0-9]+/gi, '-')}-results.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
