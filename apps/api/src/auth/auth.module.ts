import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { AccountSecurityService } from './account-security.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SecurityController } from './security.controller';
import { TwoFactorService } from './two-factor.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtSecret,
        signOptions: { expiresIn: config.jwtAccessTtlSeconds, algorithm: 'HS256', issuer: 'arvo' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'arvo' },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 30 }],
        // e2e suites make many auth calls from one address.
        skipIf: () => config.nodeEnv === 'test',
      }),
    }),
  ],
  controllers: [AuthController, SecurityController],
  providers: [AuthService, AccountSecurityService, TwoFactorService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
