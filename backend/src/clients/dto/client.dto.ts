import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClientDto {
  @ApiProperty() @IsString() email: string;
  @ApiProperty() @IsString() inboundId: string;
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
}

export class BulkClientDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) ids: string[];
  @ApiProperty({ enum: ['enable', 'disable', 'delete', 'addTraffic', 'addDays', 'resetUsage'] })
  @IsIn(['enable', 'disable', 'delete', 'addTraffic', 'addDays', 'resetUsage'])
  action: 'enable' | 'disable' | 'delete' | 'addTraffic' | 'addDays' | 'resetUsage';
  @ApiPropertyOptional() @IsOptional() @IsNumber() value?: number;
}
