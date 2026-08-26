import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalTrim(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

/**
 * Create client review (admin)
 * POST /api/client-reviews
 */
export const createClientReview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const clientName = String(req.body.clientName ?? '').trim();
    const companyName = optionalTrim(req.body.companyName);
    const email = String(req.body.email ?? '')
      .trim()
      .toLowerCase();
    const designation = optionalTrim(req.body.designation);
    const message = String(req.body.message ?? '').trim();

    if (!clientName) {
      res.status(400).json({
        success: false,
        message: 'Client name is required',
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

    const review = await prisma.clientReview.create({
      data: {
        clientName,
        companyName: companyName ?? '',
        email,
        designation: designation ?? '',
        message,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Client review created successfully',
      data: review,
    });
  } catch (error) {
    console.error('Create Client Review Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create client review',
    });
  }
};

/**
 * List client reviews (public)
 * GET /api/client-reviews
 */
export const getClientReviews = async (
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
        clientName?: { contains: string; mode: 'insensitive' };
        companyName?: { contains: string; mode: 'insensitive' };
        email?: { contains: string; mode: 'insensitive' };
        designation?: { contains: string; mode: 'insensitive' };
        message?: { contains: string; mode: 'insensitive' };
      }>;
    } = {};

    if (typeof search === 'string' && search.trim()) {
      const term = search.trim();
      where.OR = [
        { clientName: { contains: term, mode: 'insensitive' } },
        { companyName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { designation: { contains: term, mode: 'insensitive' } },
        { message: { contains: term, mode: 'insensitive' } },
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

    res.status(200).json({
      success: true,
      data: reviews,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber) || 1,
      },
    });
  } catch (error) {
    console.error('Get Client Reviews Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client reviews',
    });
  }
};

/**
 * Get single client review (public)
 * GET /api/client-reviews/:id
 */
export const getClientReviewById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const review = await prisma.clientReview.findUnique({
      where: { id },
    });

    if (!review) {
      res.status(404).json({
        success: false,
        message: 'Client review not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error('Get Client Review Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client review',
    });
  }
};

/**
 * Update client review (admin)
 * PATCH /api/client-reviews/:id
 */
export const updateClientReview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const existing = await prisma.clientReview.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Client review not found',
      });
      return;
    }

    const data: Prisma.ClientReviewUpdateInput = {};

    if (req.body.clientName !== undefined) {
      const clientName = String(req.body.clientName).trim();
      if (!clientName) {
        res.status(400).json({
          success: false,
          message: 'Client name cannot be empty',
        });
        return;
      }
      data.clientName = clientName;
    }

    if (req.body.companyName !== undefined) {
      data.companyName = optionalTrim(
        req.body.companyName
      ) as Prisma.ClientReviewUpdateInput['companyName'];
    }

    if (req.body.email !== undefined) {
      const email = String(req.body.email).trim().toLowerCase();
      if (!email) {
        res.status(400).json({
          success: false,
          message: 'Email cannot be empty',
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
      data.email = email;
    }

    if (req.body.designation !== undefined) {
      data.designation = optionalTrim(
        req.body.designation
      ) as Prisma.ClientReviewUpdateInput['designation'];
    }

    if (req.body.message !== undefined) {
      const message = String(req.body.message).trim();
      if (!message) {
        res.status(400).json({
          success: false,
          message: 'Message cannot be empty',
        });
        return;
      }
      data.message = message;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({
        success: false,
        message: 'No fields provided to update',
      });
      return;
    }

    const review = await prisma.clientReview.update({
      where: { id },
      data,
    });

    res.status(200).json({
      success: true,
      message: 'Client review updated successfully',
      data: review,
    });
  } catch (error) {
    console.error('Update Client Review Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update client review',
    });
  }
};

/**
 * Delete client review (admin)
 * DELETE /api/client-reviews/:id
 */
export const deleteClientReview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const existing = await prisma.clientReview.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Client review not found',
      });
      return;
    }

    await prisma.clientReview.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: 'Client review deleted successfully',
    });
  } catch (error) {
    console.error('Delete Client Review Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete client review',
    });
  }
};
