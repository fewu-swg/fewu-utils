import { BasicContext, Parser } from '@fewu-swg/abstract-types';
import { basename, extname } from 'path';
import { readFile } from 'fs/promises';
import { readFileSync } from 'fs';
import NewPromise from '../util/NewPromise.mjs';
import NodeModules from '../util/NodeModules.mjs';
import dynamicImport from '../util/DynamicImport.mjs';

declare interface ParseOptions {
    async?: boolean,
    type?: string,
    path?: string
};

declare interface ParseContentOptions extends ParseOptions { };
declare interface ParseFileOptions extends ParseOptions {
    path: never
}

declare type parseResult = (object | null) | Promise<(object | null)>;

export class _ObjectParser {
    availableParsers: Parser[] = [];

    #initialized = new Promise<void>(() => { });

    constructor(ctx: BasicContext) {
        this.#init();
    }

    async #init() {
        let { promise, resolve } = NewPromise.withResolvers<void>();
        this.#initialized = promise;
        let all_modules = await NodeModules.getAllModules();
        let parser_modules_list = all_modules.filter(v => basename(v).startsWith('fewu-parser-'));
        let parsers = (await Promise.all(parser_modules_list.map(async v =>
            new ((await dynamicImport<{ parser: any }>(v))?.parser!) as Parser)));
        parsers = parsers.filter(v => v.__fewu__ === 'parser');
        this.availableParsers.push(...parsers);
        resolve();
    }

    parseContent(content: string, options?: ParseContentOptions): parseResult {
        options ??= {};
        options.async ??= true;
        let _extname = options.type ?? extname(options.path as string);
        let parser: Parser | undefined;
        for (let availableParser of this.availableParsers) {
            if (availableParser.type.test(_extname)) {
                parser = availableParser;
                break;
            }
        }
        if (!parser) {
            return null;
        } else {
            if (options.async) {
                return parser.parse(content);
            } else {
                return parser.parseSync(content);
            }
        }
    }

    parseFile(path: string, options: ParseFileOptions): parseResult {
        if(!options){
            throw new Error(`Expected option, but received ${options}`);
        }
        options.async ??= true;
        // let content: string;
        if (options.async) {
            return ((async () => {
                await this.#initialized;
                let content = (await readFile(path)).toString();
                let result = await this.parseContent(content, { ...options, path });
                return result;
            })());
        }
        let content = readFileSync(path).toString();
        let result = this.parseContent(content, { ...options, path });
        return result;
    }
}