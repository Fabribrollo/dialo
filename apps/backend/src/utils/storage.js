import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

if (env.cloudinaryUrl) cloudinary.config({ secure: true });

export function uploadAvatar(buffer, idUsuario) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'dialo/avatars',
        public_id: `usuario-${idUsuario}`,
        overwrite: true,
        invalidate: true,
        resource_type: 'image',
        format: 'webp',
        transformation: [{ width: 256, height: 256, crop: 'fill', gravity: 'face' }],
      },
      (error, result) => (error ? reject(error) : resolve(result.secure_url)),
    );
    stream.end(buffer);
  });
}
