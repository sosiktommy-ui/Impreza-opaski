import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Role, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    role?: Role;
    countryId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { role, countryId, search, page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (role) where.role = role;
    if (countryId) where.countryId = countryId;
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          displayName: true,
          isActive: true,
          countryId: true,
          cityId: true,
          country: { select: { id: true, name: true, code: true } },
          city: { select: { id: true, name: true, slug: true } },
          createdAt: true,
        },
        orderBy: [{ role: 'asc' }, { displayName: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        displayName: true,
        isActive: true,
        countryId: true,
        cityId: true,
        country: { select: { id: true, name: true, code: true } },
        city: { select: { id: true, name: true, slug: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async update(id: string, data: { displayName?: string; isActive?: boolean; email?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    if (data.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: data.email, id: { not: id } },
      });
      if (existing) throw new ConflictException('Email already in use');
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        displayName: true,
        isActive: true,
        countryId: true,
        cityId: true,
      },
    });
  }

  async getCountries() {
    return this.prisma.country.findMany({
      include: {
        cities: {
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getCities(countryId?: string) {
    const where: Prisma.CityWhereInput = {};
    if (countryId) where.countryId = countryId;

    return this.prisma.city.findMany({
      where,
      include: {
        country: { select: { id: true, name: true, code: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createUser(data: {
    username: string;
    password: string;
    email: string;
    role: Role;
    displayName: string;
    countryId?: string;
    cityId?: string;
  }) {
    // Check username uniqueness
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existingUsername) throw new ConflictException('Username already exists');

    // Check email uniqueness
    const existingEmail = await this.prisma.user.findFirst({
      where: { email: data.email },
    });
    if (existingEmail) throw new ConflictException('Email already in use');

    if (data.password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await this.prisma.user.create({
      data: {
        username: data.username,
        passwordHash,
        email: data.email,
        role: data.role,
        displayName: data.displayName,
        countryId: data.countryId || null,
        cityId: data.cityId || null,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        displayName: true,
        isActive: true,
        countryId: true,
        cityId: true,
        createdAt: true,
      },
    });

    this.logger.log(`User created: ${user.username} (${user.role})`);
    return user;
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    if (user.role === Role.ADMIN) {
      // Don't allow deleting the last admin
      const adminCount = await this.prisma.user.count({ where: { role: Role.ADMIN } });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot delete the last admin user');
      }
    }

    // Delete related data first
    await this.prisma.refreshToken.deleteMany({ where: { userId: id } });
    await this.prisma.notification.deleteMany({ where: { userId: id } });

    await this.prisma.user.delete({ where: { id } });
    this.logger.log(`User deleted: ${user.username}`);
    return { success: true, message: `User ${user.username} deleted` };
  }

  async resetPassword(id: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    if (newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    // Revoke all refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.logger.log(`Password reset for user: ${user.username}`);
    return { success: true, message: `Password reset for ${user.username}` };
  }
}
