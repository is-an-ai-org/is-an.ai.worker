import { HTTPException } from 'hono/http-exception';
import { ContentfulStatusCode } from 'hono/utils/http-status';

export enum ErrorCode {
  // Authentication Errors (40000-40099)
  UNAUTHORIZED = 40001,
  INVALID_CREDENTIALS = 40002,
  TOKEN_EXPIRED = 40003,
  INVALID_TOKEN = 40004,
  FORBIDDEN = 40005,

  // GitHub Errors (40100-40199)
  GITHUB_API_ERROR = 40101,
  GITHUB_AUTH_ERROR = 40102,

  // Database Errors (40200-40299)
  DATABASE_ERROR = 40201,

  // Validation Errors (40300-40399)
  VALIDATION_ERROR = 40301,
  INVALID_STATE = 40302,

  // Domain Errors (40400-40499)
  SUBDOMAIN_ALREADY_EXISTS = 40401,
  SUBDOMAIN_NOT_FOUND = 40402,
  MAX_SUBDOMAIN_REACHED = 40403,
  INVALID_SUBDOMAIN_NAME = 40404,

  // Hosting Errors (40500-40599)
  HOSTING_NOT_FOUND = 40501,
  HOSTING_ALREADY_EXISTS = 40502,
  INDEX_HTML_REQUIRED = 40503,
  FILE_TOO_LARGE = 40504,
  TOO_MANY_FILES = 40505,

  // Internal Server Errors (50000+)
  INTERNAL_SERVER_ERROR = 50001,
}

export class AppError extends HTTPException {
  constructor(
    public statusCode: ContentfulStatusCode,
    public errorCode: ErrorCode,
    message: string
  ) {
    super(statusCode, {
      message: `[${errorCode}] : ${message}`,
    });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
