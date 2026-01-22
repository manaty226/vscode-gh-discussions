/**
 * Tests for fileNameUtils
 * Requirements: 9.1 - Unified utility functions
 */

import { sanitizeFileName } from '../utils/fileNameUtils';

describe('fileNameUtils', () => {
  describe('sanitizeFileName', () => {
    it('ファイル名に使用できない文字を置換する', () => {
      const title = 'Test<>:"/\\|?*Title';
      const result = sanitizeFileName(title);
      expect(result).toBe('Test---------Title');
    });

    it('連続する空白を単一の空白に正規化する', () => {
      const title = 'Test   Multiple   Spaces';
      const result = sanitizeFileName(title);
      expect(result).toBe('Test Multiple Spaces');
    });

    it('前後の空白をトリムする', () => {
      const title = '  Test Title  ';
      const result = sanitizeFileName(title);
      expect(result).toBe('Test Title');
    });

    it('100文字を超える場合は切り詰める', () => {
      const title = 'A'.repeat(150);
      const result = sanitizeFileName(title);
      expect(result.length).toBe(100);
    });

    it('通常のタイトルはそのまま返す', () => {
      const title = 'Normal Discussion Title';
      const result = sanitizeFileName(title);
      expect(result).toBe('Normal Discussion Title');
    });

    it('空文字の場合は空文字を返す', () => {
      const title = '';
      const result = sanitizeFileName(title);
      expect(result).toBe('');
    });

    it('空白のみの場合は空文字を返す', () => {
      const title = '   ';
      const result = sanitizeFileName(title);
      expect(result).toBe('');
    });

    it('日本語タイトルも正しく処理する', () => {
      const title = 'テスト ディスカッション タイトル';
      const result = sanitizeFileName(title);
      expect(result).toBe('テスト ディスカッション タイトル');
    });
  });
});
