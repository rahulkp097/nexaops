import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/validate-env';
import { ConversationsModule } from './conversations/conversations.module';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { HealthModule } from './health/health.module';
import { ObservabilityModule } from './observability/observability.module';
import { RequestLoggingMiddleware } from './observability/request-logging.middleware';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Phase 22 (spec §31: "Rate limiting"). A single default limit for
    // every route; auth.controller.ts overrides it tighter on the
    // unauthenticated register/login/refresh routes specifically, since
    // those are the ones brute-force/credential-stuffing actually target.
    // In-memory storage is enough for this project's single-gateway-
    // instance deployment (spec §39: engineering targets, not a
    // guaranteed production SLA) — a horizontally-scaled deployment would
    // want a shared store (e.g. Redis, already a gateway dependency)
    // instead, so every instance enforces the same counter.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    ObservabilityModule,
    DatabaseModule,
    HealthModule,
    OrganizationsModule,
    UsersModule,
    AuditModule,
    AuthModule,
    DocumentsModule,
    ConversationsModule,
    AdminModule,
    EvaluationModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
