import { rmdir } from "fs/promises";
import { existsSync } from "fs";
import { exec } from "child_process";

if (existsSync('dist')) {
    await rmdir('dist');
}
if (existsSync('dist-types')) {
    await rmdir('dist-types');
}
exec('pnpm tsc');