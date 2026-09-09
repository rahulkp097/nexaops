export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NotFoundApiError extends ApiError {
  constructor(message: string) {
    super(404, message);
    this.name = 'NotFoundApiError';
  }
}

export class BadRequestApiError extends ApiError {
  constructor(message: string) {
    super(400, message);
    this.name = 'BadRequestApiError';
  }
}
