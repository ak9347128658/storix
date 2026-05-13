/**
 * Express.js integration example
 *
 * Demonstrates:
 * - File upload via multipart form-data (using multer)
 * - Public URL response
 * - Signed URL generation
 * - Middleware for logging + metadata injection
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { createStorage } from 'storix';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const storage = await createStorage({
  provider: 's3',
  credentials: {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? '',
    region: process.env['AWS_REGION'] ?? 'us-east-1',
    bucket: process.env['AWS_BUCKET'] ?? '',
  },
  visibility: 'private',
});

// Middleware: inject uploaded-by metadata
storage.use(async (ctx, next) => {
  ctx.options.metadata = {
    ...ctx.options.metadata,
    uploadedAt: new Date().toISOString(),
    service: 'express-example',
  };
  await next();
});

// Hook: log completed uploads
storage.on('after:upload', (result) => {
  console.warn(`[Upload] ${result.key} → ${result.url}`);
});

// POST /upload — accept a single file field called "file"
app.post('/upload', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const key = `uploads/${Date.now()}-${req.file.originalname}`;

    const result = await storage.upload({
      key,
      file: req.file.buffer,
      contentType: req.file.mimetype,
      visibility: 'private',
    });

    res.json({ key: result.key, url: result.url });
  } catch (err) {
    next(err);
  }
});

// GET /signed-url?key=uploads/... — generate a 15-minute signed URL
app.get('/signed-url', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = req.query['key'] as string | undefined;
    if (!key) {
      res.status(400).json({ error: 'key query param required' });
      return;
    }

    const url = await storage.getSignedUrl(key, { expiresIn: 900 });
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// DELETE /file?key=... — delete a file
app.delete('/file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = req.query['key'] as string | undefined;
    if (!key) {
      res.status(400).json({ error: 'key query param required' });
      return;
    }

    await storage.delete({ key });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /files — list files with optional prefix
app.get('/files', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prefix = req.query['prefix'] as string | undefined;
    const result = await storage.list({ prefix, limit: 100 });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.listen(3000, () => console.warn('Storix Express example running on :3000'));
