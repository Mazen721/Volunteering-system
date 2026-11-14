import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';

function mapMongooseError(err) {
  if (err.code === 11000) {
    const duplicateMessage = err.keyPattern?.volunteerId
      ? 'الرقم التعريفي للمتطوع مسجل مسبقاً'
      : 'البيانات مسجلة مسبقاً';
    return new AppError(409, duplicateMessage);
  }
  if (err.name === 'ValidationError') {
    const firstMessage = Object.values(err.errors || {})[0]?.message || 'بيانات غير صالحة';
    return new AppError(400, firstMessage);
  }
  if (err.name === 'CastError') {
    return new AppError(400, 'المعرف غير صالح');
  }
  return null;
}

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, 'المسار المطلوب غير موجود'));
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof z.ZodError) {
    const errors = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    res.status(400).json({
      message: errors[0]?.message || 'بيانات غير صالحة',
      errors,
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'حجم الملف يتجاوز الحد المسموح به (5 ميجابايت)'
        : 'تعذر رفع الملف المحدد';
    res.status(400).json({ message });
    return;
  }

  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ message: 'تنسيق البيانات المرسلة غير صالح' });
    return;
  }

  const mapped = mapMongooseError(err);
  if (mapped) {
    res.status(mapped.statusCode).json({ message: mapped.message });
    return;
  }

  console.error('Unhandled server error:', err);
  res.status(500).json({ message: 'حدث خطأ غير متوقع في الخادم' });
}
