import { UserEntity } from '@arvo/database';
import { Body, Controller, Get, HttpStatus, Inject, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { isValidTimezone } from '../auth/timezone';
import { ApiError } from '../common/api-exception.filter';
import { UserId } from '../common/auth.decorators';
import { UpdateUserDto, UserDto } from './dto/user.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  @Get()
  @ApiOkResponse({ type: UserDto })
  async me(@UserId() userId: string): Promise<UserDto> {
    return present(await this.require(userId));
  }

  @Patch()
  @ApiOkResponse({ type: UserDto })
  async update(@UserId() userId: string, @Body() dto: UpdateUserDto): Promise<UserDto> {
    if (dto.timezone !== undefined && !isValidTimezone(dto.timezone)) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_TIMEZONE', 'timezone must be an IANA timezone');
    }
    const user = await this.require(userId);
    const repo = this.dataSource.getRepository(UserEntity);
    return present(await repo.save(repo.merge(user, { ...dto, name: dto.name?.trim() ?? user.name })));
  }

  private async require(userId: string): Promise<UserEntity> {
    const user = await this.dataSource.getRepository(UserEntity).findOneBy({ id: userId });
    if (!user) throw new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'User no longer exists');
    return user;
  }
}

function present(user: UserEntity): UserDto {
  const { id, email, name, currency, timezone, createdAt } = user;
  return { id, email, name, currency, timezone, createdAt };
}
