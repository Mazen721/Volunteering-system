import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Admin } from '../models/Admin.js';
import { AppError } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema } from '../validators/auth.schema.js';

export function createPublicAuthRouter(jwtSecret) {
  const router = express.Router();

  router.post('/login', validateBody(loginSchema), async (req, res) => {
    const email = req.body.email.toLowerCase();
    const admin = await Admin.findOne({ email }).lean();
    if (!admin) {
      throw new AppError(401, 'بيانات الدخول غير صحيحة');
    }

    const passwordMatches = await bcrypt.compare(req.body.password, admin.passwordHash);
    if (!passwordMatches) {
      throw new AppError(401, 'بيانات الدخول غير صحيحة');
    }

    const token = jwt.sign({ sub: admin._id.toString(), email: admin.email }, jwtSecret, {
      expiresIn: '7d',
    });

    res.json({
      token,
      admin: { id: admin._id.toString(), email: admin.email },
    });
  });

  return router;
}

export function createProtectedAuthRouter() {
  const router = express.Router();

  router.get('/me', (req, res) => {
    res.json({ admin: req.admin });
  });

  return router;
}
