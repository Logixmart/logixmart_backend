import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../utils/AppError';
import {
  buildPaginationMeta,
  PaginationMeta,
} from '../utils/pagination';
import { isValidEmail, optionalTrim, parseSearchTerm } from '../utils/validation';

type ClientReview = NonNullable<
  Awaited<ReturnType<typeof prisma.clientReview.findFirst>>
>;

export interface CreateClientReviewInput {
  clientName?: string;
  companyName?: unknown;
  email?: string;
  designation?: unknown;
  message?: string;
}

export interface UpdateClientReviewInput {
  id: string;
  clientName?: string;
  companyName?: unknown;
  email?: string;
  designation?: unknown;
  message?: string;
}

export interface ListClientReviewsQuery {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
}

export interface PaginatedClientReviews {
  data: ClientReview[];
  pagination: PaginationMeta;
}

export class ClientReviewService {
  async create(input: CreateClientReviewInput): Promise<ClientReview> {
    const clientName = String(input.clientName ?? '').trim();
    const companyName = optionalTrim(input.companyName);
    const email = String(input.email ?? '').trim().toLowerCase();
    const designation = optionalTrim(input.designation);
    const message = String(input.message ?? '').trim();

    if (!clientName) {
      throw new AppError('Client name is required', 400);
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

    return prisma.clientReview.create({
      data: {
        clientName,
        companyName: companyName ?? '',
        email,
        designation: designation ?? '',
        message,
      },
    });
  }

  async list(query: ListClientReviewsQuery): Promise<PaginatedClientReviews> {
    const pageNumber = Math.max(Number(query.page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.ClientReviewWhereInput = {};
    const search = parseSearchTerm(query.search);

    if (search) {
      where.OR = [
        { clientName: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { designation: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [reviews, total] = await Promise.all([
      prisma.clientReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNumber,
      }),
      prisma.clientReview.count({ where }),
    ]);

    return {
      data: reviews,
      pagination: buildPaginationMeta(pageNumber, limitNumber, total),
    };
  }

  async getById(id: string): Promise<ClientReview> {
    const review = await prisma.clientReview.findUnique({ where: { id } });

    if (!review) {
      throw new AppError('Client review not found', 404);
    }

    return review;
  }

  async update(input: UpdateClientReviewInput): Promise<ClientReview> {
    const existing = await prisma.clientReview.findUnique({
      where: { id: input.id },
    });

    if (!existing) {
      throw new AppError('Client review not found', 404);
    }

    const data: Prisma.ClientReviewUpdateInput = {};

    if (input.clientName !== undefined) {
      const clientName = String(input.clientName).trim();
      if (!clientName) {
        throw new AppError('Client name cannot be empty', 400);
      }
      data.clientName = clientName;
    }

    if (input.companyName !== undefined) {
      data.companyName = optionalTrim(input.companyName) ?? '';
    }

    if (input.email !== undefined) {
      const email = String(input.email).trim().toLowerCase();
      if (!email) {
        throw new AppError('Email cannot be empty', 400);
      }
      if (!isValidEmail(email)) {
        throw new AppError('Please provide a valid email address', 400);
      }
      data.email = email;
    }

    if (input.designation !== undefined) {
      data.designation = optionalTrim(input.designation) ?? '';
    }

    if (input.message !== undefined) {
      const message = String(input.message).trim();
      if (!message) {
        throw new AppError('Message cannot be empty', 400);
      }
      data.message = message;
    }

    if (Object.keys(data).length === 0) {
      throw new AppError('No fields provided to update', 400);
    }

    return prisma.clientReview.update({
      where: { id: input.id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.clientReview.findUnique({ where: { id } });

    if (!existing) {
      throw new AppError('Client review not found', 404);
    }

    await prisma.clientReview.delete({ where: { id } });
  }
}

export const clientReviewService = new ClientReviewService();
