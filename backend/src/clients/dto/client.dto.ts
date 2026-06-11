import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClientDto {
  @ApiProperty() @IsString() email: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) inboundIds: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() remark?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() total?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() expiryTime?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() flow?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() adminId?: string; // Target owner (for super-admin only)
}

export class UpdateClientDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() total?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() expiryTime?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() remark?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() flow?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) inboundIds?: string[];
}

export class BulkClientDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) ids: string[];
  @ApiProperty({ enum: ['enable', 'disable', 'delete', 'cleanup', 'addTraffic', 'addDays', 'resetUsage', 'resetTraffic', 'assignGroup'] })
  @IsIn(['enable', 'disable', 'delete', 'cleanup', 'addTraffic', 'addDays', 'resetUsage', 'resetTraffic', 'assignGroup'])
  action: 'enable' | 'disable' | 'delete' | 'cleanup' | 'addTraffic' | 'addDays' | 'resetUsage' | 'resetTraffic' | 'assignGroup';
  @ApiPropertyOptional() @IsOptional() @IsNumber() value?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() groupName?: string;
}

export class BulkCreateClientDto {
  @ApiProperty() @IsString() prefix: string;
  @ApiPropertyOptional() @IsOptional() @IsString() separator?: string;
  @ApiProperty() @IsNumber() startNumber: number;
  @ApiProperty() @IsNumber() endNumber: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() total?: number; // total traffic in bytes per client
  @ApiPropertyOptional() @IsOptional() @IsNumber() expiryTime?: number; // Unix ms timestamp or 0
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) inboundIds: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() group?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remark?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() flow?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() adminId?: string; // Target owner (for super-admin only)
}
