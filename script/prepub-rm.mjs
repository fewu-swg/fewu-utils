import { rm } from "fs/promises";
import { existsSync } from "fs";
import { exec } from "child_process";

if (existsSync('dist')) {
    await rm('dist', { recursive: true });
}
if (existsSync('dist-types')) {
    await rm('dist-types', { recursive: true });
}
exec('pnpm tsc');