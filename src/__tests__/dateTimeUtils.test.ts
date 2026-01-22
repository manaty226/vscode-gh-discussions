/**
 * Tests for dateTimeUtils
 * Requirements: 9.1 - Unified utility functions
 * Requirements: 10.5 - Relative timestamp display
 */

import { parseDateTime, formatDate, formatRelativeTime } from '../utils/dateTimeUtils';

describe('dateTimeUtils', () => {
  describe('parseDateTime', () => {
    it('ISO文字列をDateオブジェクトに変換する', () => {
      const isoString = '2024-01-15T10:30:00Z';
      const result = parseDateTime(isoString);
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2024-01-15T10:30:00.000Z');
    });

    it('タイムゾーン付きISO文字列を変換する', () => {
      const isoString = '2024-01-15T10:30:00+09:00';
      const result = parseDateTime(isoString);
      expect(result).toBeInstanceOf(Date);
    });

    it('ミリ秒付きISO文字列を変換する', () => {
      const isoString = '2024-01-15T10:30:00.123Z';
      const result = parseDateTime(isoString);
      expect(result.getMilliseconds()).toBe(123);
    });
  });

  describe('formatDate', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('今日の日付の場合はTodayと表示する', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const result = formatDate(date);
      expect(result).toBe('Today');
    });

    it('昨日の日付の場合はYesterdayと表示する', () => {
      const date = new Date('2024-01-14T10:00:00Z');
      const result = formatDate(date);
      expect(result).toBe('Yesterday');
    });

    it('7日以内の場合はX days agoと表示する', () => {
      const date = new Date('2024-01-12T10:00:00Z');
      const result = formatDate(date);
      expect(result).toBe('3 days ago');
    });

    it('7日以上前の場合はローカライズされた日付を表示する', () => {
      const date = new Date('2024-01-01T10:00:00Z');
      const result = formatDate(date);
      // ローカライズされた日付形式をチェック（具体的な形式は環境依存）
      expect(result).not.toBe('Today');
      expect(result).not.toBe('Yesterday');
      expect(result).not.toContain('days ago');
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('1分未満の場合は「たった今」と表示する', () => {
      const date = new Date('2024-01-15T11:59:30Z');
      const result = formatRelativeTime(date);
      expect(result).toBe('たった今');
    });

    it('1分前の場合は「1分前」と表示する', () => {
      const date = new Date('2024-01-15T11:59:00Z');
      const result = formatRelativeTime(date);
      expect(result).toBe('1分前');
    });

    it('複数分前の場合は「X分前」と表示する', () => {
      const date = new Date('2024-01-15T11:45:00Z');
      const result = formatRelativeTime(date);
      expect(result).toBe('15分前');
    });

    it('1時間前の場合は「1時間前」と表示する', () => {
      const date = new Date('2024-01-15T11:00:00Z');
      const result = formatRelativeTime(date);
      expect(result).toBe('1時間前');
    });

    it('複数時間前の場合は「X時間前」と表示する', () => {
      const date = new Date('2024-01-15T09:00:00Z');
      const result = formatRelativeTime(date);
      expect(result).toBe('3時間前');
    });

    it('昨日の場合は「昨日」と表示する', () => {
      const date = new Date('2024-01-14T12:00:00Z');
      const result = formatRelativeTime(date);
      expect(result).toBe('昨日');
    });

    it('2日前の場合は「2日前」と表示する', () => {
      const date = new Date('2024-01-13T12:00:00Z');
      const result = formatRelativeTime(date);
      expect(result).toBe('2日前');
    });

    it('7日以上前の場合は日付を表示する', () => {
      const date = new Date('2024-01-01T12:00:00Z');
      const result = formatRelativeTime(date);
      expect(result).toBe('1月1日');
    });

    it('1年以上前の場合は年月日を表示する', () => {
      const date = new Date('2023-01-01T12:00:00Z');
      const result = formatRelativeTime(date);
      expect(result).toBe('2023年1月1日');
    });
  });
});
