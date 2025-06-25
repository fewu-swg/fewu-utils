import { existsSync, readFileSync } from "fs";
import { stat } from "fs/promises";
import { join } from 'path';

async function tryEnters(enter_path: string): Promise<string> {
    if (existsSync(enter_path)) {
        // is a directory , or a file
        let s = await stat(enter_path);
        if (s.isFile()) {
            // directly returns it
            return enter_path;
        }
        // a directory, the index{.js,.mjs,.cjs}
        let try_files = ['index.mjs', 'index.js', 'index.cjs'];
        let final_path = '';
        for (const try_file of try_files) {
            if (existsSync(join(enter_path, try_file))) {
                final_path = join(enter_path, try_file);
                break;
            }
        }
        if (!final_path) {
            throw new Error(`Cannot find index.*js under the entrance!`);
        }
        return final_path;
    }
    // invalid, throw
    throw new Error(`Non-existed path '${enter_path}'`);
}

export async function dynamicImport<ExpectedExportType>(id: string) {
    let path = id;
    let result = null;
    try { // import directly
        result = await import(path);
    } catch (e) {
        try {
            path = join(process.cwd(), 'node_modules', id);
            if (!existsSync(path)) {
                path = id; // absolute import
            }
            if (!existsSync(path)) {
                throw Error(`Cannot find package '${id}' neither relative or absolute!`);
            }

            if (existsSync(path)) {
                let packageJson = JSON.parse(readFileSync(join(path, 'package.json')).toString());
                let main = join(path, packageJson.main);
                let target_path = await tryEnters(main);
                result = await import('file://' + target_path);
            }
        } catch (e) {
            console.error(`[Util/DynamicImport] Failed to import ${id}, returns with null.`);
            console.error(e);
            return null;
        }
    }
    return result as ExpectedExportType;
}