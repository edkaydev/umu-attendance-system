import type { Role } from '../../types'

export interface TourStep {
  /** Value of the data-tour attribute on the target element */
  target: string
  title: string
  content: string
}

/**
 * Per-role onboarding steps. Targets must exist on that role's dashboard;
 * steps whose element is missing (e.g. empty states) are skipped gracefully.
 * Bump TOUR_VERSION to re-show the tour to everyone after major UI changes.
 */
export const TOUR_VERSION = 1

export const TOURS: Record<Role, TourStep[]> = {
  student: [
    {
      target: 'student-live',
      title: 'Live Now',
      content:
        'When your lecturer opens a session it appears here. Tap Check In and enter the 6-character code shown in class.',
    },
    {
      target: 'student-week',
      title: 'This Week',
      content:
        'Your last 7 days at a glance — green means every class attended, amber some, red none.',
    },
    {
      target: 'student-units',
      title: 'Attendance by Unit',
      content:
        'Your percentage per course unit. Stay above 80% to keep your exam eligibility; alerts are emailed if you drop.',
    },
  ],
  lecturer: [
    {
      target: 'lecturer-new-session',
      title: 'Open New Session',
      content:
        'Start every class here. The system generates a 6-character code that students enter to check in.',
    },
    {
      target: 'lecturer-today',
      title: "Today's Sessions",
      content:
        'Every session you have opened today, with live check-in counts while a code is active.',
    },
    {
      target: 'lecturer-at-risk',
      title: 'Students At Risk',
      content:
        'Students who dropped below the 80% warning or 75% critical threshold in your units.',
    },
  ],
  faculty_admin: [
    {
      target: 'fa-stats',
      title: 'Faculty Overview',
      content:
        'Live counts for course units, students, lecturers, sessions today and active attendance alerts.',
    },
    {
      target: 'fa-people',
      title: 'Students & Lecturers',
      content:
        'Search anyone in your faculty and jump straight to their profile, assignments or reports.',
    },
    {
      target: 'fa-programmes',
      title: 'Programmes',
      content:
        'Average attendance per programme — spot problems early and generate PDF reports for meetings.',
    },
  ],
  system_admin: [
    {
      target: 'sa-quick-actions',
      title: 'Quick Actions',
      content:
        'Set up the academic structure, import CSV data and manage system settings — everything starts here.',
    },
    {
      target: 'sa-imports',
      title: 'Recent Imports',
      content:
        'Bulk uploads for academic structure, staff and students, with imported/failed counts per run.',
    },
    {
      target: 'sa-activity',
      title: 'Recent Activity',
      content:
        'An audit trail of what other administrators have been changing across the system.',
    },
  ],
}
