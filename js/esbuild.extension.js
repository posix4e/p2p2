import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function build() {
  try {
    // Build the background script with P2P2 bundled
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'test-extension/background.js')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: ['chrome91'],
      outfile: path.join(__dirname, 'test-extension/dist/background.js'),
      external: ['chrome']
    });

    // Copy test page files
    const fs = await import('fs');
    
    // Copy test-page.js
    fs.copyFileSync(
      path.join(__dirname, 'test-extension/test-page.js'),
      path.join(__dirname, 'test-extension/dist/test-page.js')
    );

    console.log('✅ Extension built successfully with esbuild!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();