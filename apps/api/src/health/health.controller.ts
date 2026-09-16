import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { ApiError } from '../common/api-exception.filter';
import { Public } from '../common/auth.decorators';

@ApiTags('health')
@Public()
@Controller()
export class HealthController {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  /** Liveness: the process is up. */
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  /** Readiness: the database is reachable and migrations are applied. */
  @Get('ready')
  async ready() {
    try {
      await this.dataSource.query('SELECT 1');
      if (await this.dataSource.showMigrations()) {
        throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'MIGRATIONS_PENDING', 'Database migrations are pending');
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'DATABASE_UNAVAILABLE', 'Database is not reachable');
    }
    return { status: 'ready' };
  }
}
