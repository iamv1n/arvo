import { UserEntity } from '@arvo/database';
import { FinanceCore } from '@arvo/finance-core';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { UserId } from '../common/auth.decorators';
import { AccountDto, AccountListDto, CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts')
export class AccountsController {
  constructor(
    @Inject(FinanceCore) private readonly core: FinanceCore,
    @Inject(DataSource) private readonly dataSource: DataSource,
  ) {}

  @Get()
  @ApiOkResponse({ type: AccountListDto })
  async list(@UserId() userId: string): Promise<AccountListDto> {
    return { items: (await this.core.accounts.list(userId)).map(AccountDto.from) };
  }

  @Get(':id')
  @ApiOkResponse({ type: AccountDto })
  async get(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<AccountDto> {
    return AccountDto.from(await this.core.accounts.get(userId, id));
  }

  @Post()
  @ApiCreatedResponse({ type: AccountDto })
  async create(@UserId() userId: string, @Body() dto: CreateAccountDto): Promise<AccountDto> {
    const currency = dto.currency ?? (await this.baseCurrency(userId));
    return AccountDto.from(await this.core.accounts.create(userId, { ...dto, currency }));
  }

  @Patch(':id')
  @ApiOkResponse({ type: AccountDto })
  async update(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountDto> {
    return AccountDto.from(await this.core.accounts.update(userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async delete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.core.accounts.delete(userId, id);
  }

  private async baseCurrency(userId: string): Promise<string> {
    const user = await this.dataSource.getRepository(UserEntity).findOneBy({ id: userId });
    return user?.currency ?? 'INR';
  }
}
