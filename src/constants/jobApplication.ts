export type ApplicationStatus =
  | 'PENDING'
  | 'REVIEWING'
  | 'SHORTLISTED'
  | 'INTERVIEW'
  | 'SELECTED'
  | 'REJECTED';

export const ALLOWED_STATUSES: ApplicationStatus[] = [
  'PENDING',
  'REVIEWING',
  'SHORTLISTED',
  'INTERVIEW',
  'SELECTED',
  'REJECTED',
];

export const JOB_SELECT = {
  id: true,
  title: true,
  location: true,
} as const;

export const APPLICATION_STATUS_MESSAGE =
  'Invalid status. Allowed values: PENDING, REVIEWING, SHORTLISTED, INTERVIEW, SELECTED, REJECTED';
