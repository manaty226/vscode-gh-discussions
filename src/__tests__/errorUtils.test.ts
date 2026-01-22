/**
 * Tests for errorUtils
 * Requirements: 2.5, 9.3 - Unified error handling
 */

import {
  extractErrorMessage,
  classifyError,
  createAppError,
  ErrorType
} from '../utils/errorUtils';

describe('errorUtils', () => {
  describe('extractErrorMessage', () => {
    it('文字列エラーをそのまま返す', () => {
      const error = 'Something went wrong';
      const result = extractErrorMessage(error);
      expect(result).toBe('Something went wrong');
    });

    it('Errorオブジェクトからmessageを抽出する', () => {
      const error = new Error('Test error message');
      const result = extractErrorMessage(error);
      expect(result).toBe('Test error message');
    });

    it('messageプロパティを持つオブジェクトから抽出する', () => {
      const error = { message: 'Custom error message' };
      const result = extractErrorMessage(error);
      expect(result).toBe('Custom error message');
    });

    it('GraphQL形式のerrorsから最初のメッセージを抽出する', () => {
      const error = {
        errors: [
          { message: 'First error' },
          { message: 'Second error' }
        ]
      };
      const result = extractErrorMessage(error);
      expect(result).toBe('First error');
    });

    it('errorsがあってもmessageがない場合はUnknown errorを返す', () => {
      const error = {
        errors: [{ code: 'ERR001' }]
      };
      const result = extractErrorMessage(error);
      expect(result).toBe('Unknown error');
    });

    it('空のerrorsの場合はデフォルトメッセージを返す', () => {
      const error = { errors: [] };
      const result = extractErrorMessage(error);
      expect(result).toBe('An unexpected error occurred');
    });

    it('nullの場合はデフォルトメッセージを返す', () => {
      const result = extractErrorMessage(null);
      expect(result).toBe('An unexpected error occurred');
    });

    it('undefinedの場合はデフォルトメッセージを返す', () => {
      const result = extractErrorMessage(undefined);
      expect(result).toBe('An unexpected error occurred');
    });

    it('数値の場合はデフォルトメッセージを返す', () => {
      const result = extractErrorMessage(404);
      expect(result).toBe('An unexpected error occurred');
    });
  });

  describe('classifyError', () => {
    describe('ネットワークエラーの分類', () => {
      it('network関連のエラーをNETWORKに分類する', () => {
        expect(classifyError(new Error('Network error'))).toBe(ErrorType.NETWORK);
        expect(classifyError(new Error('ENOTFOUND'))).toBe(ErrorType.NETWORK);
        expect(classifyError(new Error('ECONNREFUSED'))).toBe(ErrorType.NETWORK);
        expect(classifyError(new Error('Request timeout'))).toBe(ErrorType.NETWORK);
        expect(classifyError(new Error('fetch failed'))).toBe(ErrorType.NETWORK);
      });

      it('エラーコードからネットワークエラーを分類する', () => {
        const error = { message: 'Connection failed', code: 'ENOTFOUND' };
        expect(classifyError(error)).toBe(ErrorType.NETWORK);
      });
    });

    describe('認証エラーの分類', () => {
      it('認証関連のエラーをAUTHENTICATIONに分類する', () => {
        expect(classifyError(new Error('Not authenticated'))).toBe(ErrorType.AUTHENTICATION);
        expect(classifyError(new Error('Authentication required'))).toBe(ErrorType.AUTHENTICATION);
        expect(classifyError(new Error('Unauthorized'))).toBe(ErrorType.AUTHENTICATION);
        expect(classifyError(new Error('Bad credentials'))).toBe(ErrorType.AUTHENTICATION);
      });
    });

    describe('認可エラーの分類', () => {
      it('認可関連のエラーをAUTHORIZATIONに分類する', () => {
        expect(classifyError(new Error('Forbidden'))).toBe(ErrorType.AUTHORIZATION);
        expect(classifyError(new Error('Permission denied'))).toBe(ErrorType.AUTHORIZATION);
        expect(classifyError(new Error('Access denied'))).toBe(ErrorType.AUTHORIZATION);
      });
    });

    describe('レートリミットエラーの分類', () => {
      it('レートリミットエラーをRATE_LIMITに分類する', () => {
        expect(classifyError(new Error('Rate limit exceeded'))).toBe(ErrorType.RATE_LIMIT);
        expect(classifyError(new Error('Too many requests'))).toBe(ErrorType.RATE_LIMIT);
      });
    });

    describe('NotFoundエラーの分類', () => {
      it('Not foundエラーをNOT_FOUNDに分類する', () => {
        expect(classifyError(new Error('Not found'))).toBe(ErrorType.NOT_FOUND);
        expect(classifyError(new Error('Could not resolve repository'))).toBe(ErrorType.NOT_FOUND);
      });

      it('GraphQL NOT_FOUNDエラーを分類する', () => {
        const error = {
          errors: [{ message: 'Resource not found', type: 'NOT_FOUND' }]
        };
        expect(classifyError(error)).toBe(ErrorType.NOT_FOUND);
      });
    });

    describe('バリデーションエラーの分類', () => {
      it('バリデーションエラーをVALIDATIONに分類する', () => {
        expect(classifyError(new Error('Invalid input'))).toBe(ErrorType.VALIDATION);
        expect(classifyError(new Error('Validation failed'))).toBe(ErrorType.VALIDATION);
      });
    });

    describe('APIエラーの分類', () => {
      it('GraphQLエラーをAPIエラーに分類する', () => {
        const error = {
          errors: [{ message: 'Some GraphQL error' }]
        };
        expect(classifyError(error)).toBe(ErrorType.API);
      });
    });

    describe('未知のエラーの分類', () => {
      it('認識できないエラーをUNKNOWNに分類する', () => {
        expect(classifyError(new Error('Some random error'))).toBe(ErrorType.UNKNOWN);
        expect(classifyError(null)).toBe(ErrorType.UNKNOWN);
      });
    });
  });

  describe('createAppError', () => {
    it('ネットワークエラーのAppErrorを作成する', () => {
      const error = new Error('Network error');
      const appError = createAppError(error);

      expect(appError.type).toBe(ErrorType.NETWORK);
      expect(appError.message).toContain('Unable to connect');
      expect(appError.retryable).toBe(true);
      expect(appError.originalError).toBe(error);
    });

    it('認証エラーのAppErrorを作成する', () => {
      const error = new Error('Not authenticated');
      const appError = createAppError(error);

      expect(appError.type).toBe(ErrorType.AUTHENTICATION);
      expect(appError.message).toContain('Authentication required');
      expect(appError.retryable).toBe(false);
    });

    it('認可エラーのAppErrorを作成する', () => {
      const error = new Error('Forbidden');
      const appError = createAppError(error);

      expect(appError.type).toBe(ErrorType.AUTHORIZATION);
      expect(appError.message).toContain('permission');
      expect(appError.retryable).toBe(false);
    });

    it('レートリミットエラーのAppErrorを作成する', () => {
      const error = new Error('Rate limit exceeded');
      const appError = createAppError(error);

      expect(appError.type).toBe(ErrorType.RATE_LIMIT);
      expect(appError.message).toContain('rate limit');
      expect(appError.retryable).toBe(true);
    });

    it('Not FoundエラーのAppErrorを作成する', () => {
      const error = new Error('Not found');
      const appError = createAppError(error);

      expect(appError.type).toBe(ErrorType.NOT_FOUND);
      expect(appError.message).toContain('not found');
      expect(appError.retryable).toBe(false);
    });

    it('バリデーションエラーのAppErrorを作成する', () => {
      const error = new Error('Invalid title length');
      const appError = createAppError(error);

      expect(appError.type).toBe(ErrorType.VALIDATION);
      expect(appError.message).toContain('Invalid');
      expect(appError.retryable).toBe(false);
    });

    it('未知のエラーのAppErrorを作成する', () => {
      const error = new Error('Something went wrong');
      const appError = createAppError(error);

      expect(appError.type).toBe(ErrorType.UNKNOWN);
      expect(appError.message).toBe('Something went wrong');
      expect(appError.retryable).toBe(true);
    });
  });
});
