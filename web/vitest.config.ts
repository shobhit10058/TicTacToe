import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Vitest-only plugin: auto-appends exports to server/src/board.ts so tests
// can import it directly. The server source stays unchanged (Nakama requires
// outFile concatenation with no module syntax).
function nakamaGlobalsPlugin(): Plugin {
  const boardPath = path.resolve(__dirname, '../server/src/board.ts');
  return {
    name: 'nakama-globals-export',
    enforce: 'pre',
    transform(code, id) {
      if (path.resolve(id) === boardPath) {
        return code + '\nexport { newBoard, applyMove, checkOutcome, WINNING_LINES };';
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), nakamaGlobalsPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@server': path.resolve(__dirname, '../server/src'),
    },
  },
})
