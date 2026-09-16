import { FinanceCore, MAX_IMPORT_BYTES, type ImportSummary } from '@arvo/finance-core';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiError } from '../common/api-exception.filter';
import { UserId } from '../common/auth.decorators';
import {
  ImportBatchDto,
  ImportDecisionDto,
  ImportRowDto,
  ImportRowsQueryDto,
  ImportSummaryDto,
  ProcessImportDto,
  UpdateImportRowDto,
  UploadImportDto,
} from './import.dto';

const CONTENT_TYPES = { CSV: 'text/csv', XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', PDF: 'application/pdf' };

const presentSummary = (s: ImportSummary): ImportSummaryDto => ({
  batch: ImportBatchDto.from(s.batch),
  counts: s.counts,
  errors: s.errors.map(({ rowNumber, code, message }) => ({ rowNumber, code, message })),
});

@ApiTags('imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(@Inject(FinanceCore) private readonly core: FinanceCore) {}

  @Get()
  @ApiOkResponse({ type: [ImportBatchDto] })
  async list(@UserId() userId: string) {
    return { items: (await this.core.imports.list(userId)).map(ImportBatchDto.from) };
  }

  @Post()
  @ApiOperation({ summary: 'Upload a statement; returns detected tables and a suggested column mapping' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'accountId'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'CSV, XLSX or PDF statement, max 10 MB' },
        accountId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiCreatedResponse({ type: ImportBatchDto })
  @UseInterceptors(
    FileInterceptor('file', {
      // Kept in memory (bounded) and never written under a user-controlled name.
      limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 5 },
    }),
  )
  async upload(@UserId() userId: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadImportDto) {
    if (!file) throw new ApiError(HttpStatus.BAD_REQUEST, 'IMPORT_FILE_REQUIRED', 'Attach a statement file as "file"');
    const batch = await this.core.imports.upload(userId, {
      accountId: dto.accountId,
      filename: file.originalname,
      bytes: new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength),
    });
    return ImportBatchDto.from(batch);
  }

  @Get(':id')
  @ApiOkResponse({ type: ImportSummaryDto })
  async summary(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return presentSummary(await this.core.imports.summary(userId, id));
  }

  @Post(':id/process')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a column mapping: normalize, validate, categorize and check duplicates' })
  @ApiOkResponse({ type: ImportSummaryDto })
  async process(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProcessImportDto) {
    return presentSummary(await this.core.imports.process(userId, id, dto.mapping));
  }

  @Get(':id/rows')
  @ApiOkResponse({ description: 'Paged rows under review' })
  async rows(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Query() query: ImportRowsQueryDto) {
    const page = await this.core.imports.rows(userId, id, {
      statuses: query.status,
      decisions: query.decision,
      limit: query.limit,
      offset: query.offset,
    });
    return { items: page.items.map(ImportRowDto.from), total: page.total, limit: query.limit ?? 100, offset: query.offset ?? 0 };
  }

  @Patch(':id/rows/:rowId')
  @ApiOkResponse({ type: ImportRowDto })
  async updateRow(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body() dto: UpdateImportRowDto,
  ) {
    return ImportRowDto.from(await this.core.imports.updateRow(userId, id, rowId, dto));
  }

  @Post(':id/decisions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept or reject rows by id or by status' })
  async decide(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ImportDecisionDto) {
    return { updated: await this.core.imports.setDecision(userId, id, { rowIds: dto.rowIds, statuses: dto.statuses }, dto.decision) };
  }

  @Post(':id/commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Write accepted rows to the ledger atomically' })
  @ApiOkResponse({ type: ImportSummaryDto })
  async commit(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return presentSummary(await this.core.imports.commit(userId, id));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ImportBatchDto })
  async cancel(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return ImportBatchDto.from(await this.core.imports.cancel(userId, id));
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Download the original statement file' })
  async file(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { filename, fileType, bytes } = await this.core.imports.file(userId, id);
    res.set({
      'Content-Type': CONTENT_TYPES[fileType],
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(Buffer.from(bytes));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete the import and its stored file; committed transactions remain' })
  @ApiNoContentResponse()
  async delete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.core.imports.delete(userId, id);
  }
}
