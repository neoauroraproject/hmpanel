import {
  IsString,
  MinLength,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}

export class UpdateAdminDto {
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
}
