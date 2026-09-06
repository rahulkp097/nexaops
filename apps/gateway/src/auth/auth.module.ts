import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordService } from './password.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { TokenService } from './token.service';

@Module({
  imports: [JwtModule.register({}), OrganizationsModule, UsersModule, AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    PasswordService,
    RefreshTokensRepository,
    JwtAuthGuard,
    RolesGuard,
    // Declared in this order so JwtAuthGuard (which populates request.user)
    // always runs before RolesGuard (which reads request.user.role).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
