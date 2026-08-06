import { Role } from '@prisma/client'

export const STUDENT_DOMAIN = '@stud.umu.ac.ug'
export const STAFF_DOMAIN = '@umu.ac.ug'

export function isStudentEmail(email: string): boolean {
  return email.toLowerCase().endsWith(STUDENT_DOMAIN)
}

export function isStaffEmail(email: string): boolean {
  return email.toLowerCase().endsWith(STAFF_DOMAIN)
}

export function isUmuEmail(email: string): boolean {
  return isStudentEmail(email) || isStaffEmail(email)
}

/**
 * The email domain must match the account's role:
 * - student accounts use @stud.umu.ac.ug
 * - staff/admin accounts use @umu.ac.ug
 */
export function roleMatchesEmail(role: Role, email: string): boolean {
  if (role === Role.student) return isStudentEmail(email)
  return isStaffEmail(email)
}
