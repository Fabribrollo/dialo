import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { AppError } from './AppError.js';

if (env.cloudinaryUrl) cloudinary.config({ secure: true });

export function uploadImage(buffer, { folder, publicId, gravity = 'center' }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        overwrite: true,
        invalidate: true,
        resource_type: 'image',
        format: 'webp',
        transformation: [{ width: 256, height: 256, crop: 'fill', gravity }],
      },
      (error, result) => {
        if (!error) return resolve(result.secure_url);
        if (error.http_code === 400) return reject(new AppError(400, 'INVALID_FILE', 'El archivo no es una imagen válida'));
        reject(error);
      },
    );
    stream.end(buffer);
  });
}
