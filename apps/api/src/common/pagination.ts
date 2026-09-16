import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 50;

/** Standard limit/offset query for paged list endpoints. */
export class PageQueryDto {
  @ApiPropertyOptional({ default: DEFAULT_PAGE_SIZE, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/** Every paged endpoint responds with this envelope. */
export function pageResponse<T>(page: { items: T[]; total: number }, query: PageQueryDto) {
  return { items: page.items, total: page.total, limit: query.limit ?? DEFAULT_PAGE_SIZE, offset: query.offset ?? 0 };
}
