import { prisma } from '../config/db'
import { Prisma, Role, User } from '@prisma/client'

/**
 * Repository for the User aggregate.
 *
 * This is the ONLY module that may translate User persistence concerns
 * into Prisma calls. Services depend on these methods — never on the
 * prisma client directly — keeping business logic decoupled from the
 * data layer (swap Prisma for anything else by rewriting this file).
 */
export const userRepository = {
  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } })
  },

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } })
  },

  findByGoogleId(googleId: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { googleId } })
  },

  findMany(where: Prisma.UserWhereInput, select?: Prisma.UserSelect): Promise<User[]> {
    return prisma.user.findMany({ where, ...(select ? { select } : {}) })
  },

  count(where: Prisma.UserWhereInput): Promise<number> {
    return prisma.user.count({ where })
  },

  create(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data })
  },

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return prisma.user.update({ where: { id }, data })
  },

  updateWhereEmail(email: string, data: Prisma.UserUpdateInput): Promise<User> {
    return prisma.user.update({ where: { email }, data })
  },

  delete(id: string): Promise<User> {
    return prisma.user.delete({ where: { id } })
  },

  /** Transactional helper for operations spanning users + related models. */
  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn)
  },

  countByRole(role: Role): Promise<number> {
    return prisma.user.count({ where: { role } })
  },

  /** Full profile with faculty/programme relations for /auth/me. */
  findFullProfile(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        profileComplete: true,
        hasCompletedTour: true,
        mustChangePassword: true,
        facultyId: true,
        faculty: { select: { id: true, name: true, code: true } },
        programmeId: true,
        programme: { select: { id: true, name: true, code: true } },
        year: true,
        semester: true,
        academicYear: true,
        regNumber: true,
        studentNumber: true,
        isActive: true,
      },
    })
  },
}
