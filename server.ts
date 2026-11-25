import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CPP_ENGINE_DIR = path.resolve(__dirname, 'cpp-engine');

interface CppFileEntry {
  path: string;
  size: number;
  content: string;
}

function collectCppFiles(dir: string, baseDir: string): CppFileEntry[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: CppFileEntry[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'build') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectCppFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      const content = fs.readFileSync(fullPath, 'utf-8');
      results.push({
        path: relPath,
        size: Buffer.byteLength(content, 'utf-8'),
        content,
      });
    }
  }

  return results.sort((a, b) => a.path.localeCompare(b.path));
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/cpp-files', (_req, res) => {
    try {
      const files = collectCppFiles(CPP_ENGINE_DIR, CPP_ENGINE_DIR);
      res.json({ root: 'cpp-engine', files });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'No se pudieron leer los archivos C++.',
      });
    }
  });

  app.get('/api/download-cpp-zip', async (_req, res) => {
    try {
      const files = collectCppFiles(CPP_ENGINE_DIR, CPP_ENGINE_DIR);
      if (files.length === 0) {
        res.status(404).json({ error: 'No se encontraron archivos en cpp-engine.' });
        return;
      }

      const zip = new JSZip();
      const folder = zip.folder('voxdsp-cpp-engine');
      if (!folder) {
        res.status(500).json({ error: 'No se pudo inicializar el archivo ZIP.' });
        return;
      }

      for (const file of files) {
        folder.file(file.path, file.content);
      }

      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="voxdsp-cpp-portaudio.zip"');
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Error generando el paquete ZIP.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`VoxDSP Studio server running on http://localhost:${port}`);
  });
}

startServer();
