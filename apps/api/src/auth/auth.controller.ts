import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/auth.decorators';
import type { ArvoRequest } from '../common/request-context';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto, TokenResponseDto } from './dto/auth.dto';

export const REFRESH_COOKIE = 'arvo_refresh';

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('register')
  @ApiCreatedResponse({ type: TokenResponseDto })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    return this.withCookie(res, await this.auth.register(dto));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenResponseDto })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.withCookie(res, await this.auth.login(dto));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenResponseDto })
  async refresh(@Body() dto: RefreshDto, @Req() req: ArvoRequest, @Res({ passthrough: true }) res: Response) {
    return this.withCookie(res, await this.auth.refresh(dto.refreshToken ?? readCookie(req)));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async logout(@Body() dto: RefreshDto, @Req() req: ArvoRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(dto.refreshToken ?? readCookie(req));
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
  }

  private withCookie(res: Response, tokens: TokenResponseDto): TokenResponseDto {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.config.nodeEnv === 'production',
      sameSite: 'lax',
      path: '/auth',
      expires: new Date(tokens.refreshTokenExpiresAt),
    });
    return tokens;
  }
}

function readCookie(req: ArvoRequest): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}
