import type { MerchantRecord } from '@arvo/finance-core';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class MerchantDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 'SWIGGY' }) normalizedName!: string;

  static from(m: MerchantRecord): MerchantDto {
    return { id: m.id, name: m.name, normalizedName: m.normalizedName };
  }
}

export class MerchantListDto {
  @ApiProperty({ type: [MerchantDto] }) items!: MerchantDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}

export class MerchantNameDto {
  @ApiProperty({ example: 'Swiggy' })
  @IsString()
  @Length(1, 120)
  name!: string;
}
