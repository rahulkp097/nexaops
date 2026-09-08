import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, ReplaySubject } from 'rxjs';

// Kept for this long after completion/error so a client that opens
// GET /conversations/:id/stream slightly after the response finished still
// gets the full replay instead of a 404.
const SESSION_RETENTION_MS = 5 * 60 * 1000;

export type ChatSseEventType = 'message_start' | 'source' | 'token' | 'message_complete' | 'error';

// One in-memory pub/sub session per conversation with an in-flight assistant
// response. A ReplaySubject buffers every emitted event, so a subscriber
// that attaches after generation has already started (or finished) still
// receives the full sequence from message_start onward — this is what lets
// generation run independently of whether/when a client is listening.
@Injectable()
export class ChatStreamRegistry {
  private readonly sessions = new Map<string, ReplaySubject<MessageEvent>>();

  // Returns null if a session is already active for this conversation
  // (the caller should treat that as "a response is already being generated").
  start(conversationId: string): ReplaySubject<MessageEvent> | null {
    if (this.sessions.has(conversationId)) {
      return null;
    }
    const subject = new ReplaySubject<MessageEvent>();
    this.sessions.set(conversationId, subject);
    return subject;
  }

  emit(subject: ReplaySubject<MessageEvent>, type: ChatSseEventType, data: object): void {
    subject.next({ type, data });
  }

  complete(conversationId: string, subject: ReplaySubject<MessageEvent>): void {
    subject.complete();
    setTimeout(() => {
      if (this.sessions.get(conversationId) === subject) {
        this.sessions.delete(conversationId);
      }
    }, SESSION_RETENTION_MS).unref();
  }

  // Releases the session slot immediately, with no replay retention — for
  // when generation never actually started (e.g. the DB write that
  // persists the user message failed), so a retry isn't blocked by a
  // spurious 409 for the full retention window.
  abort(conversationId: string, subject: ReplaySubject<MessageEvent>): void {
    subject.complete();
    if (this.sessions.get(conversationId) === subject) {
      this.sessions.delete(conversationId);
    }
  }

  get(conversationId: string): Observable<MessageEvent> | null {
    return this.sessions.get(conversationId) ?? null;
  }
}
