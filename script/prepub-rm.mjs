import { rmdir } from "fs/promises";
import { existsSync } from "fs";
import { exec } from "child_process";

if (existsSync('dist')) {
    await rmdir('dist', { recursive: true });
}
if (existsSync('dist-types')) {
    await rmdir('dist-types', { recursive: true });
}
exec('pnpm tsc');