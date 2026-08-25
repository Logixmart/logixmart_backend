import { Response } from 'express';
import ExcelJS from 'exceljs';
import { JobApplicationStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

const ALLOWED_STATUSES: JobApplicationStatus[] = [
  'PENDING',
  'REVIEWING',
  'SHORTLISTED',
  'INTERVIEW',
  'SELECTED',
  'REJECTED',
];

function formatDate(value: Date): string {
  return value.toISOString();
}

async function sendWorkbook(
  res: Response,
  workbook: ExcelJS.Workbook,
  filename: string
): Promise<void> {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`
  );
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  await workbook.xlsx.write(res);
  res.end();
}

function exportStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Export job applications as Excel (super admin)
 * GET /api/job-applications/export
 */
export const exportJobApplications = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { search = '', status, jobId } = req.query;

    const where: {
      OR?: Array<{
        applicantName?: { contains: string; mode: 'insensitive' };
        email?: { contains: string; mode: 'insensitive' };
      }>;
      status?: JobApplicationStatus;
      jobId?: string;
    } = {};

    if (typeof search === 'string' && search.trim()) {
      const term = search.trim();
      where.OR = [
        { applicantName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (typeof status === 'string' && status.trim()) {
      const normalized = status.trim().toUpperCase();
      if (!ALLOWED_STATUSES.includes(normalized as JobApplicationStatus)) {
        res.status(400).json({
          success: false,
          message: 'Invalid status filter',
        });
        return;
      }
      where.status = normalized as JobApplicationStatus;
    }

    if (typeof jobId === 'string' && jobId.trim()) {
      where.jobId = jobId.trim();
    }

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

    const stamp = exportStamp();
    await sendWorkbook(res, workbook, `job-applications-${stamp}.xlsx`);
  } catch (error) {
    console.error('Export Job Applications Error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to export job applications',
      });
    }
  }
};

/**
 * Export contact / query submissions as Excel (super admin)
 * GET /api/contact/export
 */
export const exportContacts = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { search = '' } = req.query;

    const where: {
      OR?: Array<{
        name?: { contains: string; mode: 'insensitive' };
        email?: { contains: string; mode: 'insensitive' };
        subject?: { contains: string; mode: 'insensitive' };
        message?: { contains: string; mode: 'insensitive' };
      }>;
    } = {};

    if (typeof search === 'string' && search.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { subject: { contains: term, mode: 'insensitive' } },
        { message: { contains: term, mode: 'insensitive' } },
      ];
    }

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

    const stamp = exportStamp();
    await sendWorkbook(res, workbook, `queries-${stamp}.xlsx`);
  } catch (error) {
    console.error('Export Contacts Error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to export queries',
      });
    }
  }
};
