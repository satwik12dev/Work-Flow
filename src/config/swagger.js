import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const specPath = path.resolve(__dirname, '../../docs/api/openapi.json');
const rawSpec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));

rawSpec.servers = [
  {
    url: `${config.APP_URL}/api/v1`,
    description: config.NODE_ENV === 'production' ? 'Production' : 'Development',
  },
];

export const swaggerSpec = rawSpec;
