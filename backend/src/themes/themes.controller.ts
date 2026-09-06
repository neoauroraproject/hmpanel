import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, RolesGuard } from '../common/roles.guard';
import { ThemesService } from './themes.service';

@ApiTags('Themes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('themes')
export class ThemesController {
  constructor(private themes: ThemesService) {}

  @Get()
  list() {
    return this.themes.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.themes.get(id);
  }

  @Get(':id/export')
  exportJson(@Param('id') id: string) {
    return this.themes.exportJson(id);
  }

  @Post()
  create(@Body() body: { slug?: string; name: string; authorName?: string; description?: string; settings?: unknown }) {
    return this.themes.create({ ...body, slug: body.slug || body.name });
  }

  @Post('import')
  importJson(@Body() body: unknown) {
    return this.themes.importJson(body);
  }

  @Post(':id/clone')
  clone(@Param('id') id: string) {
    return this.themes.clone(id);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.themes.publish(id);
  }

  @Post(':id/unpublish')
  unpublish(@Param('id') id: string) {
    return this.themes.unpublish(id);
  }

  @Post(':id/versions')
  addVersion(
    @Param('id') id: string,
    @Body() body: { version: string; payload?: unknown; changelog?: string },
  ) {
    return this.themes.addVersion(id, body.version, body.payload, body.changelog);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      authorName?: string;
      description?: string;
      settings?: unknown;
      status?: string;
    },
  ) {
    return this.themes.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.themes.remove(id);
  }
}
