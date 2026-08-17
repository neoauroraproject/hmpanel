import {
  IsString,
  MinLength,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AdminPanelQuotaDto {
  @ApiProperty() @IsString() panelId: string;
  @ApiProperty() @IsNumber() balanceBytes: number;
}

export class CreateAdminDto {
  @ApiProperty() @IsString() username: string;
  @ApiProperty() @IsString() email: string;
  @ApiProperty() @IsString() password: string;
  @ApiPropertyOptional() @IsOptional() @IsString() role?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() trafficMode?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() balance?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inboundIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() expiryTime?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxClients?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
  @ApiPropertyOptional() @IsOptional() refundOnDelete?: boolean;
  @ApiPropertyOptional() @IsOptional() refundOnEdit?: boolean;
  @ApiPropertyOptional() @IsOptional() unlimitedTraffic?: boolean;
  @ApiPropertyOptional() @IsOptional() storeEnabled?: boolean;
  @ApiPropertyOptional({ enum: ['GLOBAL', 'PER_PANEL'] })
  @IsOptional()
  @IsString()
  quotaMode?: string;
  @ApiPropertyOptional({ type: [AdminPanelQuotaDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminPanelQuotaDto)
  panelQuotas?: AdminPanelQuotaDto[];
}

export class UpdateAdminDto {
  /** Super-admin only — renames 3x-ui client group oldName → newName on every panel. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) username?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() balance?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() trafficMode?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() expiryTime?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxClients?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() password?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inboundIds?: string[];
  @ApiPropertyOptional() @IsOptional() portalSettings?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() refundOnDelete?: boolean;
  @ApiPropertyOptional() @IsOptional() refundOnEdit?: boolean;
  @ApiPropertyOptional() @IsOptional() unlimitedTraffic?: boolean;
  @ApiPropertyOptional() @IsOptional() storeEnabled?: boolean;
  @ApiPropertyOptional({ enum: ['GLOBAL', 'PER_PANEL'] })
  @IsOptional()
  @IsString()
  quotaMode?: string;
  @ApiPropertyOptional({ type: [AdminPanelQuotaDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminPanelQuotaDto)
  panelQuotas?: AdminPanelQuotaDto[];
}
