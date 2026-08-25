import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import {
  backupContactSubmissions,
  backupInBackground,
} from '../lib/jsonBackup';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalTrim(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

/**
 * Submit contact form (public)
 * POST /api/contact
 */
export const createContact = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const name = String(req.body.name ?? '').trim();
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const message = String(req.body.message ?? '').trim();
    const phone = optionalTrim(req.body.phone);
    const subject = optionalTrim(req.body.subject);

    if (!name) {
      res.status(400).json({
        success: false,
        message: 'Name is required',
      });
      return;
    }

    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Email is required',
      });
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
      return;
    }

    if (!message) {
      res.status(400).json({
        success: false,
        message: 'Message is required',
      });
      return;
    }

    const contact = await prisma.contactSubmission.create({
      data: {
        name,
        email,
        phone,
        subject,
        message,
      },
    });

    backupInBackground(backupContactSubmissions, 'contactSubmissions');

    res.status(201).json({
      success: true,
      message: 'Contact form submitted successfully',
      data: contact,
    });
  } catch (error) {
    console.error('Create Contact Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit contact form',
    });
  }
};

/**
 * List contact submissions (admin)
 * GET /api/contact
 */
export const getContacts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { page = '1', limit = '20', search = '' } = req.query;

    const pageNumber = Math.max(Number(page), 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;

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

    const [contacts, total] = await Promise.all([
      prisma.contactSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNumber,
      }),
      prisma.contactSubmission.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: contacts,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber) || 1,
      },
    });
  } catch (error) {
    console.error('Get Contacts Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact submissions',
    });
  }
};

/**
 * Delete contact submission (admin)
 * DELETE /api/contact/:id
 */
export const deleteContact = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const existing = await prisma.contactSubmission.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Contact submission not found',
      });
      return;
    }

    await prisma.contactSubmission.delete({ where: { id } });
    backupInBackground(backupContactSubmissions, 'contactSubmissions');

    res.status(200).json({
      success: true,
      message: 'Contact submission deleted successfully',
    });
  } catch (error) {
    console.error('Delete Contact Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete contact submission',
    });
  }
};
