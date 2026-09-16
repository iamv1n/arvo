import { ApiTokenEntity, generateApiToken } from '@arvo/database';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { DataSource, IsNull } from 'typeorm';
import { ApiError } from '../common/api-exception.filter';
import { UserId } from '../common/auth.decorators';

const MAX_ACTIVE_TOKENS = 20;

class CreateTokenDto {
  @ApiProperty({ example: 'Claude Desktop' }) @IsString() @Length(1, 80) name!: string;

  @ApiPropertyOptional({ description: 'Days until expiry; omit for no expiry', example: 90 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}

class TokenDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 'arvo_pat_Xy12ab', description: 'First characters, for recognition' }) tokenPrefix!: string;
  @ApiProperty({ type: [String] }) scopes!: string[];
  @ApiProperty({ type: Date, nullable: true }) lastUsedAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) expiresAt!: Date | null;
  @ApiProperty() createdAt!: Date;

  static from(t: ApiTokenEntity): TokenDto {
    return {
      id: t.id,
      name: t.name,
      tokenPrefix: t.tokenPrefix,
      scopes: t.scopes,
      lastUsedAt: t.lastUsedAt,
      expiresAt: t.expiresAt,
      createdAt: t.createdAt,
    };
  }
}

class CreatedTokenDto extends TokenDto {
  @ApiProperty({ description: 'Shown only once. Store it securely.' }) token!: string;
}

@ApiTags('tokens')
@ApiBearerAuth()
@Controller('me/tokens')
export class TokensController {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  @Get()
  @ApiOkResponse({ type: [TokenDto] })
  async list(@UserId() userId: string) {
    const tokens = await this.dataSource
      .getRepository(ApiTokenEntity)
      .find({ where: { userId, revokedAt: IsNull() }, order: { createdAt: 'DESC' } });
    return { items: tokens.map(TokenDto.from) };
  }

  @Post()
  @ApiOperation({ summary: 'Create a read-only personal access token for MCP clients' })
  @ApiCreatedResponse({ type: CreatedTokenDto })
  async create(@UserId() userId: string, @Body() dto: CreateTokenDto): Promise<CreatedTokenDto> {
    const repo = this.dataSource.getRepository(ApiTokenEntity);
    if ((await repo.countBy({ userId, revokedAt: IsNull() })) >= MAX_ACTIVE_TOKENS) {
      throw new ApiError(HttpStatus.CONFLICT, 'TOO_MANY_TOKENS', `At most ${MAX_ACTIVE_TOKENS} active tokens are allowed`);
    }
    const { token, prefix, hash } = generateApiToken();
    const saved = await repo.save(
      repo.create({
        userId,
        name: dto.name.trim(),
        tokenPrefix: prefix,
        tokenHash: hash,
        scopes: ['read'],
        expiresAt: dto.expiresInDays ? new Date(Date.now() + dto.expiresInDays * 86_400_000) : null,
        lastUsedAt: null,
        revokedAt: null,
      }),
    );
    return { ...TokenDto.from(saved), token };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a token immediately' })
  async revoke(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.dataSource
      .getRepository(ApiTokenEntity)
      .update({ id, userId, revokedAt: IsNull() }, { revokedAt: new Date() });
    if (!result.affected) throw new ApiError(HttpStatus.NOT_FOUND, 'TOKEN_NOT_FOUND', 'Token not found');
  }
}
