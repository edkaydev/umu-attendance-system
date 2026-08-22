import { describe, expect, it } from 'vitest'
import { Role } from '@prisma/client'
import {
  STAFF_DOMAIN,
  STUDENT_DOMAIN,
  isStaffEmail,
  isStudentEmail,
  isUmuEmail,
  roleMatchesEmail,
} from './domain'

describe('isStudentEmail', () => {
  it('accepts student addresses regardless of case', () => {
    expect(isStudentEmail(`jane.doe${STUDENT_DOMAIN}`)).toBe(true)
    expect(isStudentEmail('Jane.Doe@STUD.UMU.AC.UG')).toBe(true)
  })

  it('rejects staff and foreign addresses', () => {
    expect(isStudentEmail(`lecturer${STAFF_DOMAIN}`)).toBe(false)
    expect(isStudentEmail('someone@gmail.com')).toBe(false)
  })

  it('rejects addresses that merely contain the domain', () => {
    expect(isStudentEmail('jane@stud.umu.ac.ug.evil.com')).toBe(false)
  })
})

describe('isStaffEmail', () => {
  it('accepts staff addresses regardless of case', () => {
    expect(isStaffEmail(`lecturer${STAFF_DOMAIN}`)).toBe(true)
    expect(isStaffEmail('Lecturer@UMU.AC.UG')).toBe(true)
  })

  it('rejects student addresses (the leading @ anchors the domain)', () => {
    expect(isStaffEmail(`jane${STUDENT_DOMAIN}`)).toBe(false)
  })

  it('rejects foreign addresses', () => {
    expect(isStaffEmail('someone@gmail.com')).toBe(false)
  })
})

describe('isUmuEmail', () => {
  it('accepts both student and staff addresses', () => {
    expect(isUmuEmail(`jane${STUDENT_DOMAIN}`)).toBe(true)
    expect(isUmuEmail(`lecturer${STAFF_DOMAIN}`)).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isUmuEmail('someone@gmail.com')).toBe(false)
    expect(isUmuEmail('')).toBe(false)
  })
})

describe('roleMatchesEmail', () => {
  it('requires the student domain for student accounts', () => {
    expect(roleMatchesEmail(Role.student, `jane${STUDENT_DOMAIN}`)).toBe(true)
    expect(roleMatchesEmail(Role.student, `jane${STAFF_DOMAIN}`)).toBe(false)
  })

  it('requires the staff domain for every non-student role', () => {
    for (const role of [Role.lecturer, Role.faculty_admin, Role.system_admin]) {
      expect(roleMatchesEmail(role, `person${STAFF_DOMAIN}`)).toBe(true)
      expect(roleMatchesEmail(role, `person${STUDENT_DOMAIN}`)).toBe(false)
    }
  })
})
