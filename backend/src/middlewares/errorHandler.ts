import type { ErrorRequestHandler } from 'express';
import { ServiceError } from '../services/errors.js';
import { CustomerError } from '../utils/customerSecurity.js';
import type { ContentRepository } from '../services/contentRepository.js';

export function createErrorHandler(
  repository: Pick<ContentRepository, 'storage'>,
): ErrorRequestHandler {
  return (error: unknown, req, res, _next) => {
    void _next;
    if (res.headersSent) return;
    const status =
      error instanceof ServiceError || error instanceof CustomerError
        ? error.status
        : typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status: unknown }).status)
          : 500;
    if (status === 413) {
      res.status(413).json({ message: 'Dữ liệu gửi lên vượt quá giới hạn cho phép.' });
      return;
    }
    if (status >= 400 && status < 500) {
      res.status(status).json({
        message:
          error instanceof ServiceError || error instanceof CustomerError
            ? error.message
            : 'Yêu cầu không hợp lệ.',
      });
      return;
    }
    if (error instanceof CustomerError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    if (
      (req.path === '/api/contact' ||
        req.path.startsWith('/api/admin/content') ||
        req.path.includes('/orders')) &&
      (status >= 500 || repository.storage === 'mongodb')
    ) {
      res
        .status(503)
        .json({ message: 'Hiện hệ thống chưa thể lưu dữ liệu. Vui lòng thử lại sau.' });
      return;
    }
    const serverStatus = status >= 500 && status <= 599 ? status : 500;
    res.status(serverStatus).json({
      message:
        serverStatus === 503
          ? 'Dịch vụ hiện chưa khả dụng. Vui lòng thử lại sau.'
          : 'Đã xảy ra lỗi máy chủ.',
    });
  };
}
