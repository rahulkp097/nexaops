import { AsyncLocalStorage } from 'async_hooks';
import { Injectable } from '@nestjs/common';

export interface RequestContextStore {
  requestId: string;
}

// Phase 18 (spec §27): every log line along a request's path — auth,
// retrieval, tool calls, the LLM call, the final response — should carry
// the same request id, without threading it through every method
// signature in between. AsyncLocalStorage carries it across the whole
// async call chain for one request (set once in RequestLoggingMiddleware,
// read anywhere downstream, including inside HTTP calls to ai-service).
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  run<T>(store: RequestContextStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  get requestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }
}
