#!/usr/bin/env node
/**
 * Unified Dev Server — Single process manages both Next.js + WebSocket
 *
 * Previous problem:
 *   - `npm run dev` only started WebSocket; Next.js was started separately
 *   - Two independent processes raced -> .next chunk manifest mismatch -> 500 errors
 *
 * Solution:
 *   - One Node process manages both child processes
 *   - Start Next.js first, then WebSocket (ordered)
 *   - Ctrl+C kills both children cleanly
 *   - Clean .next cache on every dev start
 */

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const isProduction = process.env.NODE_ENV === 'production';

// 1. Clean .next cache (dev only)
if (!isProduction) {
    const nextDir = join(rootDir, '.next');
    if (existsSync(nextDir)) {
        rmSync(nextDir, { recursive: true, force: true });
        console.log('[dev-server] Cleaned .next cache');
    }
}

const children = [];

function run(command, args, name) {
    console.log('[dev-server] Starting: ' + command + ' ' + args.join(' '));
    const proc = spawn(command, args, {
        cwd: rootDir,
        stdio: 'inherit',
        env: { ...process.env },
    });
    proc.on('exit', (code) => {
        if (code && code !== 0) {
            console.log('[dev-server] ' + name + ' exited (code ' + code + ')');
        }
    });
    children.push({ proc, name });
    return proc;
}

function shutdown() {
    console.log('\n[dev-server] Shutting down...');
    for (const { proc } of children) {
        try { proc.kill('SIGTERM'); } catch { /* ignore */ }
    }
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// 2. Start Next.js (dev or start)
const nextCmd = isProduction ? 'start' : 'dev';
run('npx', ['next', nextCmd, '--turbo'], 'Next.js');

// 3. Start WebSocket server (after Next.js is ready)
const delay = isProduction ? 0 : 3000;
setTimeout(() => {
    run('npx', ['tsx', 'server/socket/server.ts'], 'WebSocket');
}, delay);
