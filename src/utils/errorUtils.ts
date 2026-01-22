/**
 * Error handling utility functions
 * Requirements: 9.3 - Unified error handling, 2.5 - Error display and retry
 */

import * as vscode from 'vscode';

interface GraphQLError {
  message?: string;
  type?: string;
  [key: string]: unknown;
}

interface ErrorWithMessage {
  message: string;
}

interface ErrorWithErrors {
  errors: GraphQLError[];
}

interface ErrorWithCode {
  code?: string;
}

/**
 * Error types for categorization
 */
export enum ErrorType {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMIT = 'rate_limit',
  NOT_FOUND = 'not_found',
  VALIDATION = 'validation',
  API = 'api',
  UNKNOWN = 'unknown'
}

/**
 * Structured error with type and user-friendly message
 */
export interface AppError {
  type: ErrorType;
  message: string;
  originalError?: unknown;
  retryable: boolean;
}

function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ErrorWithMessage).message === 'string'
  );
}

function isErrorWithErrors(error: unknown): error is ErrorWithErrors {
  return (
    typeof error === 'object' &&
    error !== null &&
    'errors' in error &&
    Array.isArray((error as ErrorWithErrors).errors)
  );
}

function isErrorWithCode(error: unknown): error is ErrorWithCode {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error
  );
}

/**
 * Extract error message from various error types
 * Handles strings, Error objects, and GraphQL error responses
 */
export function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (isErrorWithMessage(error)) {
    return error.message;
  }

  if (isErrorWithErrors(error) && error.errors.length > 0) {
    return error.errors[0].message || 'Unknown error';
  }

  return 'An unexpected error occurred';
}

/**
 * Classify error into a specific type for appropriate handling
 */
export function classifyError(error: unknown): ErrorType {
  const message = extractErrorMessage(error).toLowerCase();

  // Check for network errors
  if (
    message.includes('network') ||
    message.includes('enotfound') ||
    message.includes('econnrefused') ||
    message.includes('timeout') ||
    message.includes('fetch failed')
  ) {
    return ErrorType.NETWORK;
  }

  // Check for authentication errors
  if (
    message.includes('not authenticated') ||
    message.includes('authentication') ||
    message.includes('unauthorized') ||
    message.includes('bad credentials')
  ) {
    return ErrorType.AUTHENTICATION;
  }

  // Check for authorization/permission errors
  if (
    message.includes('forbidden') ||
    message.includes('permission') ||
    message.includes('access denied')
  ) {
    return ErrorType.AUTHORIZATION;
  }

  // Check for rate limiting
  if (
    message.includes('rate limit') ||
    message.includes('too many requests')
  ) {
    return ErrorType.RATE_LIMIT;
  }

  // Check for not found errors
  if (
    message.includes('not found') ||
    message.includes('could not resolve')
  ) {
    return ErrorType.NOT_FOUND;
  }

  // Check for validation errors
  if (
    message.includes('invalid') ||
    message.includes('validation')
  ) {
    return ErrorType.VALIDATION;
  }

  // Check error code if available
  if (isErrorWithCode(error)) {
    const code = error.code?.toLowerCase();
    if (code === 'enotfound' || code === 'econnrefused' || code === 'etimedout') {
      return ErrorType.NETWORK;
    }
  }

  // Check GraphQL error types
  if (isErrorWithErrors(error) && error.errors.length > 0) {
    const gqlError = error.errors[0];
    if (gqlError.type === 'NOT_FOUND') {
      return ErrorType.NOT_FOUND;
    }
    if (gqlError.type === 'FORBIDDEN') {
      return ErrorType.AUTHORIZATION;
    }
    return ErrorType.API;
  }

  return ErrorType.UNKNOWN;
}

/**
 * Create a structured AppError from any error
 */
export function createAppError(error: unknown): AppError {
  const type = classifyError(error);
  const originalMessage = extractErrorMessage(error);

  let message: string;
  let retryable = false;

  switch (type) {
    case ErrorType.NETWORK:
      message = 'Unable to connect to GitHub. Please check your internet connection.';
      retryable = true;
      break;
    case ErrorType.AUTHENTICATION:
      message = 'Authentication required. Please sign in to GitHub.';
      retryable = false;
      break;
    case ErrorType.AUTHORIZATION:
      message = 'You do not have permission to perform this action.';
      retryable = false;
      break;
    case ErrorType.RATE_LIMIT:
      message = 'GitHub API rate limit exceeded. Please wait a moment and try again.';
      retryable = true;
      break;
    case ErrorType.NOT_FOUND:
      message = 'The requested resource was not found.';
      retryable = false;
      break;
    case ErrorType.VALIDATION:
      message = `Invalid input: ${originalMessage}`;
      retryable = false;
      break;
    case ErrorType.API:
      message = `GitHub API error: ${originalMessage}`;
      retryable = true;
      break;
    default:
      message = originalMessage || 'An unexpected error occurred.';
      retryable = true;
  }

  return {
    type,
    message,
    originalError: error,
    retryable
  };
}

/**
 * Show error message to user with optional retry action
 * Returns true if user chose to retry
 */
export async function showErrorWithRetry(
  error: unknown,
  retryCallback?: () => Promise<void>
): Promise<boolean> {
  const appError = createAppError(error);

  if (appError.retryable && retryCallback) {
    const action = await vscode.window.showErrorMessage(
      appError.message,
      'Retry',
      'Cancel'
    );

    if (action === 'Retry') {
      try {
        await retryCallback();
        return true;
      } catch (retryError) {
        // If retry fails, show error without retry option to avoid infinite loop
        vscode.window.showErrorMessage(extractErrorMessage(retryError));
        return false;
      }
    }
    return false;
  }

  // For authentication errors, offer to sign in
  if (appError.type === ErrorType.AUTHENTICATION) {
    const action = await vscode.window.showErrorMessage(
      appError.message,
      'Sign In',
      'Cancel'
    );

    if (action === 'Sign In') {
      await vscode.commands.executeCommand('github-discussions.authenticate');
      return true;
    }
    return false;
  }

  // For other errors, just show the message
  vscode.window.showErrorMessage(appError.message);
  return false;
}

/**
 * Wrap an async operation with error handling
 * Shows appropriate error messages and optionally retries
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  options?: {
    retryable?: boolean;
    errorMessage?: string;
  }
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    const appError = createAppError(error);

    // Use custom error message if provided
    const message = options?.errorMessage
      ? `${options.errorMessage}: ${appError.message}`
      : appError.message;

    if (options?.retryable && appError.retryable) {
      const retried = await showErrorWithRetry(
        { message },
        async () => { await operation(); }
      );
      if (retried) {
        return operation();
      }
    } else {
      vscode.window.showErrorMessage(message);
    }

    return undefined;
  }
}
