import { Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import { AuthenticatedRequest } from '../middlewares/auth';
import { exportService } from '../services/exportService';

async function sendWorkbook(
  res: Response,
  workbook: ExcelJS.Workbook,
  filename: string
): Promise<void> {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, private'
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  await workbook.xlsx.write(res);
  res.end();
}

/**
 * Export job applications as Excel (super admin)
 * GET /api/job-applications/export
 */
export const exportJobApplications = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { workbook, filename } =
      await exportService.buildJobApplicationsWorkbook(req.query);
    await sendWorkbook(res, workbook, filename);
  } catch (error) {
    if (!res.headersSent) {
      next(error);
    }
  }
};

/**
 * Export contact / query submissions as Excel (super admin)
 * GET /api/contact/export
 */
export const exportContacts = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { workbook, filename } =
      await exportService.buildContactsWorkbook(req.query);
    await sendWorkbook(res, workbook, filename);
  } catch (error) {
    if (!res.headersSent) {
      next(error);
    }
  }
};
