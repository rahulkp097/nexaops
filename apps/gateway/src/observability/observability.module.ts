import { Global, Module } from '@nestjs/common';
import { RequestContextService } from './request-context.service';
import { RequestLoggingMiddleware } from './request-logging.middleware';

// @Global(): RequestContextService is read from every module that calls
// ai-service (conversations, evaluation, ...) — importing this module
// once in AppModule makes it injectable everywhere without every one of
// those feature modules also having to import it.
@Global()
@Module({
  providers: [RequestContextService, RequestLoggingMiddleware],
  exports: [RequestContextService, RequestLoggingMiddleware],
})
export class ObservabilityModule {}
