import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../utils/AppError';
import {
  buildPaginationMeta,
  PaginationMeta,
} from '../utils/pagination';
import { isValidEmail, optionalTrim, parseSearchTerm } from '../utils/validation';
import { emailService } from './mail';

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

    // Notify the client-query recipient only after the query is durably saved.
    // Notification failures must never affect storage or the API response.
    await this.notifyClientQuery(contact);

    return contact;
  }

  private async notifyClientQuery(contact: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    subject: string | null;
    message: string;
    createdAt: Date;
  }): Promise<void> {
    try {
      await emailService.sendClientQueryNotification({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        subject: contact.subject,
        message: contact.message,
        createdAt: contact.createdAt,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      console.error('[mail] Client query notification error:', reason);
    }
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
      select: { id: true },
    });

    if (!existing) {
      throw new AppError('Contact submission not found', 404);
    }

    await prisma.contactSubmission.delete({ where: { id } });
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
