import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseThemeImport, toThemeExport } from './theme-export';

@Injectable()
export class ThemesService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.theme().findMany({
      orderBy: { updatedAt: 'desc' },
      include: { versions: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
  }

  async get(id: string) {
    const row = await this.theme().findUnique({
      where: { id },
      include: { versions: { orderBy: { createdAt: 'desc' } }, assets: true },
    });
    if (!row) throw new NotFoundException('Theme not found');
    return row;
  }

  async listPublished() {
    return this.theme().findMany({
      where: { status: 'published' },
      orderBy: { updatedAt: 'desc' },
      include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  async getStorefrontAssignment(adminId: string) {
    try {
      const store = await this.prismaAny().storeProfile.findUnique({
        where: { adminId },
        select: { id: true, theme: true, slug: true, title: true },
      });
      if (!store) return { themeId: null, store: null };
      const themeId = this.isThemeId(store.theme) ? store.theme : null;
      return { themeId, store };
    } catch {
      return { themeId: null, store: null };
    }
  }

  async assignStorefront(adminId: string, themeId: string | null) {
    if (themeId) {
      const row = await this.get(themeId);
      if (String(row.status) !== 'published') {
        throw new BadRequestException('Only published themes can be assigned to the storefront');
      }
    }
    try {
      const store = await this.prismaAny().storeProfile.findUnique({
        where: { adminId },
        select: { id: true },
      });
      if (!store) {
        throw new BadRequestException('Create a Store profile first');
      }
      await this.prismaAny().storeProfile.update({
        where: { adminId },
        data: { theme: themeId || 'modern' },
      });
      return this.getStorefrontAssignment(adminId);
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(err?.message || 'Could not assign storefront theme');
    }
  }

  async resolvePublished(themeId: string | null | undefined) {
    if (!this.isThemeId(themeId)) return null;
    try {
      const row = await this.theme().findFirst({
        where: { id: themeId, status: 'published' },
        select: { id: true, slug: true, name: true, settings: true },
      });
      return row;
    } catch {
      return null;
    }
  }

  private isThemeId(value: string | null | undefined): value is string {
    return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  async create(data: {
    slug: string;
    name: string;
    authorName?: string;
    description?: string;
    settings?: unknown;
  }) {
    const slug = this.normalizeSlug(data.slug || data.name);
    return this.theme().create({
      data: {
        slug,
        name: data.name,
        authorName: data.authorName,
        description: data.description,
        status: 'draft',
        settings: (data.settings as object) || {},
        versions: {
          create: {
            version: '1.0.0',
            payload: {},
            changelog: 'Initial version',
          },
        },
      },
      include: { versions: true },
    });
  }

  async clone(id: string) {
    const src = await this.get(id);
    return this.create({
      slug: `${src.slug}-copy`,
      name: `${src.name} copy`,
      authorName: src.authorName || undefined,
      description: src.description || undefined,
      settings: src.settings,
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      authorName?: string;
      description?: string;
      settings?: unknown;
      status?: string;
    },
  ) {
    await this.get(id);
    return this.theme().update({
      where: { id },
      data: {
        name: data.name,
        authorName: data.authorName,
        description: data.description,
        settings: data.settings as object | undefined,
        status: data.status,
      },
    });
  }

  async publish(id: string) {
    return this.theme().update({
      where: { id },
      data: { status: 'published' },
    });
  }

  async unpublish(id: string) {
    return this.theme().update({
      where: { id },
      data: { status: 'unpublished' },
    });
  }

  async addVersion(id: string, version: string, payload?: unknown, changelog?: string) {
    await this.get(id);
    return this.prismaAny().themeVersion.create({
      data: {
        themeId: id,
        version,
        payload: (payload as object) || {},
        changelog,
      },
    });
  }

  async exportJson(id: string) {
    const row = await this.get(id);
    const latest = row.versions?.[0];
    return toThemeExport({
      slug: row.slug,
      name: row.name,
      authorName: row.authorName,
      description: row.description,
      settings: row.settings,
      version: latest?.version || '1.0.0',
      payload: latest?.payload,
    });
  }

  async importJson(raw: unknown) {
    const doc = parseThemeImport(raw);
    const existing = await this.theme().findUnique({ where: { slug: doc.slug } });
    if (existing) {
      await this.prismaAny().themeVersion.create({
        data: {
          themeId: existing.id,
          version: doc.version,
          payload: (doc.payload as object) || {},
          changelog: 'Imported',
        },
      });
      return this.theme().update({
        where: { id: existing.id },
        data: {
          name: doc.name,
          authorName: doc.authorName,
          description: doc.description,
          settings: (doc.settings as object) || {},
        },
      });
    }
    return this.theme().create({
      data: {
        slug: doc.slug,
        name: doc.name,
        authorName: doc.authorName,
        description: doc.description,
        status: 'draft',
        settings: (doc.settings as object) || {},
        versions: {
          create: { version: doc.version, payload: (doc.payload as object) || {} },
        },
      },
      include: { versions: true },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.theme().delete({ where: { id } });
    return { ok: true };
  }

  private normalizeSlug(value: string): string {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);
    if (!slug) throw new BadRequestException('Invalid theme slug');
    return slug;
  }

  private theme() {
    return this.prismaAny().theme;
  }

  private prismaAny(): any {
    return this.prisma as any;
  }
}
