import { prisma } from '../prisma/client.js';
import { emailAvailabilitySchema } from '../validations/authValidation.js';
import { Router } from 'express';
import { forgotPassword, login, logout, register, resetPassword } from '../controllers/authController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { limitForgotPassword, limitLoginFailures, limitRegister } from '../utils/rateLimit.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validations/authValidation.js';

const router = Router();

router.post('/email-availability', validate({ body: emailAvailabilitySchema }), limitForgotPassword, async (req, res) => {
  const exists = await prisma.usuario.count({ where: { correo: req.validated.body.correo } });
  res.json({ disponible: exists === 0 });
});
router.post('/register', limitRegister, validate({ body: registerSchema }), register);
router.post('/login', validate({ body: loginSchema }), limitLoginFailures, login);
router.post('/logout', authenticate, logout);
router.post('/forgot-password', validate({ body: forgotPasswordSchema }), limitForgotPassword, forgotPassword);
router.post('/reset-password', validate({ body: resetPasswordSchema }), resetPassword);

export default router;
