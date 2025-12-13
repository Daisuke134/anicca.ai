/**
 * エラーハンドリングユーティリティ
 * 
 * 最小限のエラーハンドリング機能を提供
 * API応答とログ出力の統一化
 */

import { IS_PRODUCTION } from '../config/environment.js';

/**
 * エラーレスポンスの統一フォーマット
 */
export class ApiError extends Error {
  constructor(code, message, statusCode = 500, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * エラーレスポンスを送信
 * @param {Response} res - Express/Vercelのレスポンスオブジェクト
 * @param {Error} error - エラーオブジェクト
 */
export function sendErrorResponse(res, error) {
  // ApiErrorの場合はそのステータスコードを使用
  const statusCode = error instanceof ApiError ? error.statusCode : 500;
  
  // エラーレスポンスの構造
  const errorResponse = {
    error: {
      code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
      message: error.message || 'Internal server error',
      ...(error.details && { details: error.details })
    }
  };
  
  // 開発環境では詳細なエラー情報を含める
  if (!IS_PRODUCTION && !(error instanceof ApiError)) {
    errorResponse.stack = error.stack;
  }
  
  // ログ出力
  console.error(`[${new Date().toISOString()}] Error ${statusCode}:`, error.message);
  if (!IS_PRODUCTION) {
    console.error(error.stack);
  }
  
  // レスポンス送信
  res.status(statusCode).json(errorResponse);
}

/**
 * 非同期関数のエラーハンドリングラッパー
 * @param {Function} handler - 非同期ハンドラー関数
 * @returns {Function} エラーハンドリング付きハンドラー
 */
export function asyncHandler(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      sendErrorResponse(res, error);
    }
  };
}

/**
 * 一般的なエラーを生成するヘルパー関数
 */
export const Errors = {
  // 認証エラー
  unauthorized: (message = 'Unauthorized') => new ApiError('UNAUTHORIZED', message, 401),
  forbidden: (message = 'Forbidden') => new ApiError('FORBIDDEN', message, 403),
  
  // リソースエラー
  notFound: (resource = 'Resource') => new ApiError('NOT_FOUND', `${resource} not found`, 404),
  conflict: (message = 'Conflict') => new ApiError('CONFLICT', message, 409),
  
  // バリデーションエラー
  badRequest: (message = 'Bad request', details = null) => new ApiError('INVALID_REQUEST', message, 400, details),
  
  // サーバーエラー
  internal: (message = 'Internal server error') => new ApiError('INTERNAL_ERROR', message, 500),
  serviceUnavailable: (message = 'Service temporarily unavailable') => new ApiError('SERVICE_UNAVAILABLE', message, 503)
};

/**
 * エラーメッセージを安全にログ出力
 * @param {string} context - エラーが発生したコンテキスト
 * @param {Error} error - エラーオブジェクト
 */
export function logError(context, error) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [${context}] ${error.message}`);
  
  if (!IS_PRODUCTION) {
    console.error(`Stack trace:`, error.stack);
  }
}