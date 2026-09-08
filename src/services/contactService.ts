import { Prisma } from '@prisma/client';
import {
  backupContactSubmissions,
  backupInBackground,
} from '../lib/jsonBackup';
import prisma from '../lib/prisma';
import { AppError } from '../utils/AppError';
import {
  buildPaginationMeta,
  PaginationMeta,
} from '../utils/pagination';
import { isValidEmail, optionalTrim, parseSearchTerm } from '../utils/validation';

type ContactSubmission = NonNullable<
  Awaited<ReturnType<typeof prisma.contactSubmission.findFirst>>
>;

export interface CreateContactInput {
  name?: string;
  email?: string;
  message?: string;
  phone?: unknown;
  subject?: unknown;
}

export interface ListContactsQuery {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
}

export interface PaginatedContacts {
  data: ContactSubmission[];
  pagination: PaginationMeta;
}

export class ContactService {
  async create(input: CreateContactInput): Promise<ContactSubmission> {
    const name = String(input.name ?? '').trim();
    const email = String(input.email ?? '').trim().toLowerCase();
    const message = String(input.message ?? '').trim();
    const phone = optionalTrim(input.phone);
    const subject = optionalTrim(input.subject);

    if (!name) {
      throw new AppError('Name is required', 400);
    }

    if (!email) {
      throw new AppError('Email is required', 400);
    }

    if (!isValidEmail(email)) {
      throw new AppError('Please provide a valid email address', 400);
    }

    if (!message) {
      throw new AppError('Message is required', 400);
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
    return contact;
  }

  async list(query: ListContactsQuery): Promise<PaginatedContacts> {
    const pageNumber = Math.max(Number(query.page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.ContactSubmissionWhereInput = {};
    const search = parseSearchTerm(query.search);

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
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

    return {
      data: contacts,
      pagination: buildPaginationMeta(pageNumber, limitNumber, total),
    };
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.contactSubmission.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError('Contact submission not found', 404);
    }

    await prisma.contactSubmission.delete({ where: { id } });
    backupInBackground(backupContactSubmissions, 'contactSubmissions');
  }

  buildExportWhere(search: unknown): Prisma.ContactSubmissionWhereInput {
    const where: Prisma.ContactSubmissionWhereInput = {};
    const term = parseSearchTerm(search);

    if (term) {
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { subject: { contains: term, mode: 'insensitive' } },
        { message: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }
}

export const contactService = new ContactService();
