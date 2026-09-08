import ExcelJS from 'exceljs';
import prisma from '../lib/prisma';
import { contactService } from './contactService';
import { jobApplicationService } from './jobApplicationService';

function formatDate(value: Date): string {
  return value.toISOString();
}

export function exportStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export class ExportService {
  async buildJobApplicationsWorkbook(query: {
    search?: unknown;
    status?: unknown;
    jobId?: unknown;
  }): Promise<{ workbook: ExcelJS.Workbook; filename: string }> {
    const where = jobApplicationService.buildListWhere(query);

    const applications = await prisma.jobApplication.findMany({
      where,
      include: {
        job: {
          select: {
            title: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Logixmart';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Job Applications');
    sheet.columns = [
      { header: 'Applicant Name', key: 'applicantName', width: 28 },
      { header: 'Email', key: 'email', width: 32 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Job Title', key: 'jobTitle', width: 28 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Applied At', key: 'createdAt', width: 24 },
    ];

    sheet.getRow(1).font = { bold: true };

    for (const app of applications) {
      sheet.addRow({
        applicantName: app.applicantName,
        email: app.email,
        phone: app.phone ?? '',
        jobTitle: app.job?.title ?? '',
        status: app.status,
        createdAt: formatDate(app.createdAt),
      });
    }

    return {
      workbook,
      filename: `job-applications-${exportStamp()}.xlsx`,
    };
  }

  async buildContactsWorkbook(query: {
    search?: unknown;
  }): Promise<{ workbook: ExcelJS.Workbook; filename: string }> {
    const where = contactService.buildExportWhere(query.search);

    const contacts = await prisma.contactSubmission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Logixmart';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Queries');
    sheet.columns = [
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Email', key: 'email', width: 32 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Subject', key: 'subject', width: 28 },
      { header: 'Query Message', key: 'message', width: 50 },
      { header: 'Date', key: 'createdAt', width: 24 },
    ];

    sheet.getRow(1).font = { bold: true };

    for (const contact of contacts) {
      sheet.addRow({
        name: contact.name,
        email: contact.email,
        phone: contact.phone ?? '',
        subject: contact.subject ?? '',
        message: contact.message,
        createdAt: formatDate(contact.createdAt),
      });
    }

    return {
      workbook,
      filename: `queries-${exportStamp()}.xlsx`,
    };
  }
}

export const exportService = new ExportService();
