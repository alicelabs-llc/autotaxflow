import { prisma, ReportStatus, ReportType } from '@autotaxflow/db';
import type { ReportJobData } from '@autotaxflow/shared';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Genera un reporte. MVP local: escribe un CSV simple en disco bajo
 * /tmp/autotaxflow-reports/<reportId>.csv y actualiza fileUrl en DB.
 * En producción se reemplazaría por S3 presigned URL.
 */
export async function processReport(data: ReportJobData) {
  const { reportId } = data;

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { organization: true },
  });
  if (!report) throw new Error(`Report ${reportId} not found`);

  await prisma.report.update({
    where: { id: reportId },
    data: { status: ReportStatus.GENERATING },
  });

  try {
    const periodStart = report.periodStart;
    const periodEnd = report.periodEnd;

    const transactions = await prisma.transaction.findMany({
      where: {
        organizationId: report.organizationId,
        occurredAt: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { occurredAt: 'asc' },
      select: {
        occurredAt: true,
        type: true,
        amount: true,
        currency: true,
        customerState: true,
        customerCountry: true,
        sourceId: true,
      },
    });

    const outDir = process.env.AUTOTAXFLOW_REPORTS_DIR || '/tmp/autotaxflow-reports';
    await fs.mkdir(outDir, { recursive: true });

    let fileContent: string;
    let fileName: string;

    if (report.type === ReportType.CPA_EXPORT_CSV || report.type === ReportType.MONTHLY_SUMMARY) {
      fileName = `${reportId}.csv`;
      const header = 'date,type,amount,currency,state,country,sourceId\n';
      const rows = transactions
        .map(
          (t) =>
            `${t.occurredAt.toISOString()},${t.type},${t.amount.toNumber()},${t.currency},${
              t.customerState || ''
            },${t.customerCountry || ''},${t.sourceId}`
        )
        .join('\n');
      fileContent = header + rows;
    } else {
      // NEXUS_RISK_PDF — para MVP volcamos CSV con extensión .csv; el PDF real se haría con pdfkit.
      fileName = `${reportId}.csv`;
      const header = 'date,type,amount,currency,state,country,sourceId\n';
      const rows = transactions
        .map(
          (t) =>
            `${t.occurredAt.toISOString()},${t.type},${t.amount.toNumber()},${t.currency},${
              t.customerState || ''
            },${t.customerCountry || ''},${t.sourceId}`
        )
        .join('\n');
      fileContent = header + rows;
    }

    const filePath = path.join(outDir, fileName);
    await fs.writeFile(filePath, fileContent, 'utf8');

    await prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.READY, fileUrl: filePath },
    });
  } catch (err) {
    await prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.ERROR, fileUrl: null },
    });
    throw err;
  }
}
