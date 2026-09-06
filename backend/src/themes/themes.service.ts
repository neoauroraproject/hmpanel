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
