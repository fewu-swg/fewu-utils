import { basename, dirname, join } from "path";
import { lstat, readdir, readFile, readlink } from "fs/promises";
import { existsSync, lstatSync } from "fs";
import { NewPromise } from "./NewPromise.mjs";

declare type DeclaredDependencies = {
    dependencies: Record<string, string>,
    devDependencies: Record<string, string>
}

declare type TraverseOptions = {
    ignoreLink: boolean
}

export class NodeModulesPnpmResolver {
    constructor() { }

    async getModules(node_modules_dir: string, blacklist: string[] = []): Promise<string[]> {
        if (!existsSync(node_modules_dir)) {
            console.warn(`Trying to scan non-existed path ${node_modules_dir}, returns with empty array.`);
            return [];
        }
        let scanned_module_paths = (await readdir(node_modules_dir)).filter(v => !(v.startsWith('.') || v.startsWith('@types') || v === 'node_modules'));
        let simple_modules: string[] = [];
        let scopes: string[] = [];
        scanned_module_paths.forEach(v => {
            if (v.startsWith('@')) {
                scopes.push(v);
            } else {
                simple_modules.push(v);
            }
        });
        let simple_module_paths = simple_modules.map(v => join(node_modules_dir, v));
        let scope_paths = scopes.map(v => join(node_modules_dir, v));
        let scoped_extracted_module_paths: string[] = [];
        for await (const scope_path of scope_paths) {
            let scoped_module_paths = (await readdir(scope_path)).map(v => join(scope_path, v));
            scoped_extracted_module_paths.push(...scoped_module_paths);
        }
        simple_module_paths = [...simple_module_paths, ...scoped_extracted_module_paths];
        let real_module_paths = await NewPromise.map(simple_module_paths, async (path: string) => {
            let stat = await lstat(path);
            if (stat.isSymbolicLink()) {
                let l = await readlink(path);
                return join(dirname(path), l);
            }
            return path;
        });
        real_module_paths = real_module_paths.filter(v => !blacklist.includes(v));
        let result_module_paths: string[] = [...real_module_paths];
        let real_node_module_dirs = [...new Set(real_module_paths.map(v => {
            let result = dirname(v);
            if (basename(result).startsWith('@')) {
                result = dirname(result);
            }
            return result;
        }))];
        for await (const sub_node_modules_dir of real_node_module_dirs) {
            if (existsSync(sub_node_modules_dir)) {
                let sub_scanned_module_paths = await this.getModules(sub_node_modules_dir, real_module_paths);
                result_module_paths.push(...sub_scanned_module_paths);
            }
        }
        let final_module_paths = await NewPromise.map(result_module_paths, async (path: string) => {
            let stat = await lstat(path);
            if (stat.isSymbolicLink()) {
                let l = await readlink(path);
                return join(dirname(path), l);
            }
            return path;
        });
        final_module_paths = [...new Set(final_module_paths)];
        return final_module_paths;
    }

    static async deprecated_getPnpmModules() {
        let node_modules_dir = join(process.cwd(), 'node_modules/.pnpm');

        let pnpm_tops = await readdir(node_modules_dir);

        pnpm_tops = pnpm_tops.filter(v => v != 'lock.yaml' && v != 'node_modules');

        pnpm_tops = pnpm_tops.map(v => join(node_modules_dir, v, "node_modules"));

        let all_results = (await Promise.all(pnpm_tops.map(async v => NodeModules.traverseModuleDirectory(v)))).flat(1);

        return all_results;
    }
}

export class NodeModules {
    static pnpm = new NodeModulesPnpmResolver();

    static async traverseModuleDirectory(modules_dir: string, options: TraverseOptions = {
        ignoreLink: true
    }): Promise<string[]> {
        let first_traverse_result = await readdir(modules_dir);

        let all_results: string[] = [], scoped_results: string[] = [];

        first_traverse_result.forEach(result => {
            if (result.startsWith('.')) {
                return;
            }
            if (result.startsWith('@')) {
                scoped_results.push(join(modules_dir, result));
            } else {
                all_results.push(join(modules_dir, result));
            }
        });

        if (options.ignoreLink) {
            all_results = all_results.filter(v => {
                let fstat = lstatSync(v);
                if (fstat.isSymbolicLink()) {
                    return false;
                }
                return true;
            });
        }

        await Promise.all(scoped_results.map(async scoped_result => {
            let scoped_modules = await NodeModules.traverseModuleDirectory(scoped_result);
            // scoped_modules = scoped_modules.map(v => join(scoped_result, v));
            all_results.push(...scoped_modules);
        }));

        await Promise.all(all_results.map(async result => {
            let result_submodule_dir = join(result, "node_modules");
            if (existsSync(result_submodule_dir)) {
                let submodules = await NodeModules.traverseModuleDirectory(result_submodule_dir);
                submodules = submodules.map(v => join(result_submodule_dir, v));
                all_results.push(...submodules);
            }
        }));

        return all_results;
    }

    static async getAllModules() {
        let node_modules_dir = join(process.cwd(), 'node_modules');
        if (!existsSync(join(node_modules_dir, ".pnpm"))) {
            // classic npm
            let all_results = await this.traverseModuleDirectory(node_modules_dir);

            return all_results;
        } else {
            // pnpm
            return await this.pnpm.getModules(node_modules_dir);
        }

    }



    static #declaredDependencies?: DeclaredDependencies;

    static async getDeclaredDependencies(): Promise<DeclaredDependencies> {
        if (this.#declaredDependencies) {
            return this.#declaredDependencies;
        }
        const package_json_path = join(process.cwd(), 'package.json');
        if (!existsSync(package_json_path)) {
            return {
                dependencies: {},
                devDependencies: {}
            };
        }
        const package_json_content = (await readFile(package_json_path)).toString();
        const package_json: { dependencies: Record<string, string>, devDependencies: Record<string, string> } = JSON.parse(package_json_content);
        const { dependencies, devDependencies } = package_json;
        return {
            dependencies: dependencies ?? {},
            devDependencies: devDependencies ?? {}
        }
    }
}