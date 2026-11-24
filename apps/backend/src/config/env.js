import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT) || 3000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  isProduction: process.env.NODE_ENV === 'production',
  resendApiKey: process.env.RESEND_API_KEY || '',
  mailFrom: process.env.MAIL_FROM || '',
  cloudinaryUrl: process.env.CLOUDINARY_URL || '',
  livekitUrl: process.env.LIVEKIT_URL || '',
  // Dirección del servidor de LiveKit vista desde el backend. Vacía: usa LIVEKIT_URL.
  livekitApiUrl: process.env.LIVEKIT_API_URL || '',
  livekitApiKey: process.env.LIVEKIT_API_KEY || '',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  // Detrás de un proxy del mismo origen (Docker) la cookie puede ser lax y sin Secure sobre http://localhost.
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : null,
  cookieSameSite: ['lax', 'strict', 'none'].includes(process.env.COOKIE_SAMESITE) ? process.env.COOKIE_SAMESITE : null,
};
