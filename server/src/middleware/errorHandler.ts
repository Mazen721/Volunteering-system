import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';

interface MongooseLikeError extends Error {
  code?: number;
  keyPattern?: Record<string, unknown>;
  errors?: Record<string, { message?: string } | undefined>;
}

function mapMongooseError(err: unknown): AppError | null {
  if (!(err instanceof Error)) {
    return null;
  }
  const candidate = err as MongooseLikeError;

  if (candidate.code === 11000) {
    let duplicateMessage = 'البيانات مسجلة مسبقاً';
    if (candidate.keyPattern?.volunteerId) {
      duplicateMessage = 'الرقم التعريفي للمتطوع مسجل مسبقاً';
    } else if (candidate.keyPattern?.['registration.volunteerId']) {
      duplicateMessage = 'الرقم التعريفي للمتطوع مسجل أو قيد المراجعة مسبقاً';
    } else if (candidate.keyPattern?.email) {
      duplicateMessage = 'البريد الإلكتروني مسجل مسبقاً';
    } else if (candidate.keyPattern?.opportunity && candidate.keyPattern?.volunteer) {
      duplicateMessage = 'لديك طلب قائم بالفعل على هذه الفرصة';
    } else if (candidate.keyPattern?.volunteer) {
      duplicateMessage = 'سجل المتطوع مرتبط بحساب مستخدم آخر بالفعل';
    }
    return new AppError(409, duplicateMessage);
  }
  if (candidate.name === 'ValidationError') {
    const firstMessage = Object.values(candidate.errors || {})[0]?.message || 'بيانات غير صالحة';
    return new AppError(400, firstMessage);
  }
  if (candidate.name === 'CastError') {
    return new AppError(400, 'المعرف غير صالح');
  }
  return null;
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'المسار المطلوب غير موجود'));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
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

  if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    err.type === 'entity.parse.failed'
  ) {
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
};
