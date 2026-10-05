import { Resend } from 'resend';
import { env } from '../config/env.js';

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

export async function sendPasswordReset(correo, link) {
  if (!env.isProduction) console.log(`[mailer] Link de recuperación para ${correo}: ${link}`);
  if (!resend) return;

  try {
    const { error } = await resend.emails.send({
      from: env.mailFrom,
      to: correo,
      subject: 'Restablecé tu contraseña de Dialo',
      html: `<p>Recibimos un pedido para restablecer tu contraseña de Dialo.</p><p><a href="${link}">Elegir una contraseña nueva</a></p><p>El enlace vence en 1 hora. Si no fuiste vos, ignorá este correo.</p>`,
    });
    if (error) console.error('[mailer] No se pudo enviar el correo:', error.message);
  } catch (error) {
    console.error('[mailer] No se pudo enviar el correo:', error.message);
  }
}
