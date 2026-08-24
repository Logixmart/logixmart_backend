import { Request, Response } from "express";
import prisma from "../lib/prisma";

/**
 * Create Job Post
 * POST /api/job-posts
 */
export const createJobPost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      title,
      description,
      companyName,
      location,
      employmentType,
      salary,
      experience,
      skills,
      responsibilities,
      qualifications,
      isActive = true,
    } = req.body;

    // Validation
    if (!title?.trim()) {
      res.status(400).json({
        success: false,
        message: "Job title is required",
      });
      return;
    }

    if (!description?.trim()) {
      res.status(400).json({
        success: false,
        message: "Job description is required",
      });
      return;
    }

    if (!companyName?.trim()) {
      res.status(400).json({
        success: false,
        message: "Company name is required",
      });
      return;
    }

    const job = await prisma.jobPost.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        companyName: companyName.trim(),
        location: location?.trim() || null,
        employmentType: employmentType?.trim() || null,
        salary: salary?.trim() || null,
        experience: experience?.trim() || null,
        skills: normalizeStringList(skills),
        responsibilities: normalizeStringList(responsibilities),
        qualifications: normalizeStringList(qualifications),
        isActive: Boolean(isActive),
      },
    });

    res.status(201).json({
      success: true,
      message: "Job created successfully",
      data: job,
    });
  } catch (error) {
    console.error("Create Job Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create job",
    });
  }
};

/**
 * Get All Job Posts
 * GET /api/job-posts
 */
export const getJobPosts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      page = "1",
      limit = "10",
      search = "",
      active,
    } = req.query;

    const pageNumber = Math.max(Number(page), 1);
    const limitNumber = Math.min(Math.max(Number(limit), 1), 100);

    const skip = (pageNumber - 1) * limitNumber;

    const where: any = {
      isDeleted: false,
    };

    // Search
    if (search && typeof search === "string") {
      where.OR = [
        {
          title: {
            contains: search.trim(),
            mode: "insensitive",
          },
        },
        {
          companyName: {
            contains: search.trim(),
            mode: "insensitive",
          },
        },
        {
          location: {
            contains: search.trim(),
            mode: "insensitive",
          },
        },
      ];
    }

    // Active filter
    if (active !== undefined) {
      where.isActive = active === "true";
    }

    const [jobs, total] = await Promise.all([
      prisma.jobPost.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limitNumber,
      }),

      prisma.jobPost.count({
        where,
      }),
    ]);

    res.status(200).json({
      success: true,
      data: jobs,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error("Get Jobs Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch jobs",
    });
  }
};

/**
 * Get Single Job
 * GET /api/job-posts/:id
 */
export const getJobPostById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const job = await prisma.jobPost.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Job not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error("Get Job Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch job",
    });
  }
};

/**
 * Update Job
 * PATCH /api/job-posts/:id
 */
export const updateJobPost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const {
      title,
      description,
      companyName,
      location,
      employmentType,
      salary,
      experience,
      skills,
      responsibilities,
      qualifications,
      isActive,
    } = req.body;

    const existingJob = await prisma.jobPost.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });

    if (!existingJob) {
      res.status(404).json({
        success: false,
        message: "Job not found",
      });
      return;
    }

    const updateData: any = {};

    if (title !== undefined) {
      updateData.title = title.trim();
    }

    if (description !== undefined) {
      updateData.description = description.trim();
    }

    if (companyName !== undefined) {
      updateData.companyName = companyName.trim();
    }

    if (location !== undefined) {
      updateData.location = location?.trim() || null;
    }

    if (employmentType !== undefined) {
      updateData.employmentType = employmentType?.trim() || null;
    }

    if (salary !== undefined) {
      updateData.salary = salary?.trim() || null;
    }

    if (experience !== undefined) {
      updateData.experience = experience?.trim() || null;
    }

    if (skills !== undefined) {
      updateData.skills = normalizeStringList(skills);
    }

    if (responsibilities !== undefined) {
      updateData.responsibilities = normalizeStringList(responsibilities);
    }

    if (qualifications !== undefined) {
      updateData.qualifications = normalizeStringList(qualifications);
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    const updatedJob = await prisma.jobPost.update({
      where: {
        id,
      },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: "Job updated successfully",
      data: updatedJob,
    });
  } catch (error) {
    console.error("Update Job Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update job",
    });
  }
};

/**
 * Delete Job
 * DELETE /api/job-posts/:id
 *
 * Soft delete
 */
export const deleteJobPost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const existingJob = await prisma.jobPost.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });

    if (!existingJob) {
      res.status(404).json({
        success: false,
        message: "Job not found",
      });
      return;
    }

    await prisma.jobPost.update({
      where: {
        id,
      },
      data: {
        isDeleted: true,
        isActive: false,
      },
    });

    res.status(200).json({
      success: true,
      message: "Job deleted successfully",
    });
  } catch (error) {
    console.error("Delete Job Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete job",
    });
  }
};

/** Accept string[], newline/comma string, or empty → cleaned string[]. */
function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}
