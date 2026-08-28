import { Request, Response, NextFunction } from 'express';
import { contactService } from '../services/contactService';

/**
 * Submit contact form (public)
 * POST /api/contact
 */
export const createContact = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const contact = await contactService.create(req.body);
    res.status(201).json({
      success: true,
      message: 'Contact form submitted successfully',
      data: contact,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List contact submissions (admin)
 * GET /api/contact
 */
export const getContacts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await contactService.list(req.query);
    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete contact submission (admin)
 * DELETE /api/contact/:id
 */
export const deleteContact = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await contactService.delete(String(req.params.id));
    res.status(200).json({
      success: true,
      message: 'Contact submission deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
