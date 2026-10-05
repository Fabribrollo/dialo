import multer from 'multer';

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANO_MAXIMO = 2 * 1024 * 1024;

const invalidFile = (message) => Object.assign(new Error(message), { status: 400, code: 'INVALID_FILE' });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO, files: 1 },
  fileFilter: (req, file, cb) => {
    if (TIPOS_PERMITIDOS.includes(file.mimetype)) cb(null, true);
    else cb(invalidFile('La foto tiene que ser JPG, PNG o WebP'));
  },
}).single('foto');

export function parseAvatar(req, res, next) {
  upload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'La foto no puede superar los 2 MB' : 'Archivo inválido';
      return next(invalidFile(message));
    }
    if (error) return next(error);
    if (!req.file) return next(invalidFile('Falta el archivo en el campo "foto"'));
    next();
  });
}
