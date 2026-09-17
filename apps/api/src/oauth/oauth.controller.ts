import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import type { Response } from 'express';
import { ApiError } from '../common/api-exception.filter';
import { Public, UserId } from '../common/auth.decorators';
import { OAuthError, OAuthService } from './oauth.service';

class DecisionDto {
  @ApiProperty() @IsBoolean() approve!: boolean;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** OAuth endpoints speak RFC 6749 errors ({ error, error_description }), not the API error envelope. */
function sendOAuthError(res: Response, error: unknown): void {
  if (error instanceof OAuthError) {
    res.status(error.status).set('Cache-Control', 'no-store').json({ error: error.error, error_description: error.description });
    return;
  }
  throw error;
}

@ApiTags('oauth')
@Controller()
export class OAuthController {
  constructor(@Inject(OAuthService) private readonly oauth: OAuthService) {}

  @Public()
  @Get('.well-known/oauth-authorization-server')
  @ApiOperation({ summary: 'OAuth 2.0 Authorization Server Metadata (RFC 8414)' })
  metadata() {
    return this.oauth.metadata();
  }

  @Public()
  @Get('.well-known/openid-configuration')
  @ApiExcludeEndpoint()
  openidConfiguration() {
    // Some MCP clients try OpenID Connect discovery; the same metadata applies.
    return { ...this.oauth.metadata(), subject_types_supported: ['public'] };
  }

  @Public()
  @Post('oauth/register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Dynamic Client Registration (RFC 7591) for public MCP clients' })
  async register(@Body() body: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    try {
      return await this.oauth.register(body ?? {});
    } catch (error) {
      sendOAuthError(res, error);
    }
  }

  @Public()
  @Get('oauth/authorize')
  @ApiOperation({ summary: 'Authorization endpoint: validates the request and sends the user to the consent page' })
  async authorize(@Query() query: Record<string, unknown>, @Res() res: Response) {
    try {
      const { redirect } = await this.oauth.authorize(query);
      res.redirect(302, redirect);
    } catch (error) {
      if (!(error instanceof OAuthError)) throw error;
      // Client or redirect URI problems are never redirected (open-redirect protection).
      res
        .status(error.status)
        .type('html')
        .send(
          `<!doctype html><meta charset="utf-8"><title>Authorization error</title><body style="font-family:system-ui;max-width:520px;margin:15vh auto;padding:0 16px"><h1>Can't connect this app</h1><p>${escapeHtml(error.description)}</p><p style="color:#667085">Error: ${escapeHtml(error.error)}</p></body>`,
        );
    }
  }

  @Post('oauth/token')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Token endpoint: authorization_code (PKCE) and refresh_token grants' })
  async token(@Body() body: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
    try {
      return await this.oauth.token(body ?? {});
    } catch (error) {
      sendOAuthError(res, error);
    }
  }

  @Post('oauth/revoke')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Token revocation (RFC 7009)' })
  async revoke(@Body() body: Record<string, unknown>) {
    await this.oauth.revoke(body ?? {});
    return {};
  }

  @Get('oauth/requests/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Details of a pending authorization request, for the consent page' })
  async request(@Param('id', ParseUUIDPipe) id: string) {
    try {
      return await this.oauth.pendingRequest(id);
    } catch (error) {
      if (error instanceof OAuthError) throw new ApiError(HttpStatus.NOT_FOUND, 'OAUTH_REQUEST_NOT_FOUND', error.description);
      throw error;
    }
  }

  @Post('oauth/requests/:id/decision')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or deny an authorization request as the signed-in user' })
  async decide(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) {
    try {
      return await this.oauth.decide(id, userId, dto.approve);
    } catch (error) {
      if (error instanceof OAuthError) throw new ApiError(HttpStatus.NOT_FOUND, 'OAUTH_REQUEST_NOT_FOUND', error.description);
      throw error;
    }
  }

  @Get('me/connections')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apps connected through OAuth' })
  async connections(@UserId() userId: string) {
    return { items: await this.oauth.connections(userId) };
  }

  @Delete('me/connections')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect an app (revokes all its tokens)' })
  async disconnect(@UserId() userId: string, @Query('client_id') clientId: string | undefined) {
    if (!clientId) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'client_id is required');
    if ((await this.oauth.disconnect(userId, clientId)) === 0) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'CONNECTION_NOT_FOUND', 'No active connection for this app');
    }
  }
}
