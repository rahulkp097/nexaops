import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthResponseDto, MeResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from './auth.service';
import { RequestMeta } from './request-meta.type';
import { RequestUser } from './types/request-user.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<AuthResponseDto> {
    return this.authService.register(dto, requestMeta(req));
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponseDto> {
    return this.authService.login(dto, requestMeta(req));
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<AuthResponseDto> {
    return this.authService.refresh(dto, requestMeta(req));
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  logout(@Body() dto: LogoutDto, @Req() req: Request): Promise<void> {
    return this.authService.logout(dto, requestMeta(req));
  }

  @Get('me')
  me(@CurrentUser() user: RequestUser): Promise<MeResponseDto> {
    return this.authService.getProfile(user);
  }
}

function requestMeta(req: Request): RequestMeta {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}
