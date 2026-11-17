import express from 'express';
import multer from 'multer';
import { buildScope, requireRole } from '../middleware/auth.js';
import { exportWorkbookBuffer } from '../services/excelExport.service.js';
import { importExcelWorkbook } from '../services/excelImport.service.js';
import { AppError } from '../utils/errors.js';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      cb(new AppError(400, 'يرجى رفع ملف إكسل بصيغة .xlsx فقط'));
      return;
    }
    cb(null, true);
  },
});

export function createExcelRouter(): express.Router {
  const router = express.Router();

  router.post('/import', requireRole('admin'), upload.single('file'), async (req, res) => {
    if (!req.file) {
      throw new AppError(400, 'يرجى اختيار ملف إكسل للاستيراد');
    }
    const commit =
      req.query.commit === 'true' || req.body?.commit === 'true' || req.body?.commit === true;
    const report = await importExcelWorkbook(req.file.buffer, { commit });
    res.json(report);
  });

  router.get('/export', requireRole('admin', 'dean'), async (req, res) => {
    const buffer = await exportWorkbookBuffer(buildScope(req.user!));
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="volunteer-hours-report.xlsx"');
    res.send(Buffer.from(buffer));
  });

  return router;
}
