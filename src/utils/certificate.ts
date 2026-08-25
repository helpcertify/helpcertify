import { jsPDF } from 'jspdf';

interface CertificateData {
  studentName: string;
  itemTitle: string;
  itemType: 'quiz' | 'practiceTest';
  category: string;
  // e.g. "92% (23/25 correct)" for a passed quiz; '' for a practice test,
  // which has no pass/fail concept — see models.ts's passMarkPercent comment.
  scoreLabel: string;
  dateLabel: string;
  certificateCode: string;
}

// Runs entirely client-side (jsPDF) — same reasoning as exportToExcel.ts's
// exceljs usage: no Vercel function spent just to generate a file, and
// nothing here needs server trust. It's a formatted record of data the
// student already has access to (their own score, already verified by
// api/quiz-session.ts at submit time, or their own answeredQuestionIds
// progress), not a new grant of anything.
export function downloadCertificate(data: CertificateData) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const brandBlue = '#2563eb';
  const ink = '#0f172a';
  const faint = '#64748b';

  doc.setDrawColor(brandBlue);
  doc.setLineWidth(1.2);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
  doc.setLineWidth(0.4);
  doc.rect(13, 13, pageWidth - 26, pageHeight - 26);

  doc.setTextColor(brandBlue);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('HELPCERTIFY', pageWidth / 2, 30, { align: 'center' });

  doc.setTextColor(ink);
  doc.setFontSize(28);
  doc.text('Certificate of Completion', pageWidth / 2, 50, { align: 'center' });

  doc.setTextColor(faint);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text('This certifies that', pageWidth / 2, 70, { align: 'center' });

  doc.setTextColor(ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(data.studentName, pageWidth / 2, 85, { align: 'center' });

  doc.setTextColor(faint);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const verb = data.itemType === 'quiz' ? 'has successfully passed' : 'has successfully completed';
  doc.text(verb, pageWidth / 2, 98, { align: 'center' });

  doc.setTextColor(ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(data.itemTitle, pageWidth / 2, 110, { align: 'center' });

  doc.setTextColor(faint);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(data.category, pageWidth / 2, 118, { align: 'center' });

  if (data.scoreLabel) {
    doc.setFontSize(12);
    doc.text(`Score: ${data.scoreLabel}`, pageWidth / 2, 128, { align: 'center' });
  }

  doc.setFontSize(10);
  doc.text(`Issued ${data.dateLabel}  ·  Certificate ID: ${data.certificateCode}`, pageWidth / 2, pageHeight - 20, { align: 'center' });

  const safeName = data.itemTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`helpcertify-certificate-${safeName}.pdf`);
}
