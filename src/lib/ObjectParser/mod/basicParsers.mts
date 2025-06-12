import { Parser } from "@fewu-swg/abstract-types";
import { parse as parseYaml } from "yaml";

export class _JSONParser implements Parser {
    __fewu__ = 'parser';

    type = /\.?json$/;

    async parse(content: string) {
        return this.parseSync(content);
    }
    parseSync(content: string) {
        try {
            return JSON.parse(content);
        } catch (e) {
            return null;
        }
    }
}

export class _YAMLParser implements Parser {
    __fewu__ = 'parser';

    type = /\.?ya?ml$/;
  
    async parse(content: string){
        return parseYaml(content);
    }
    parseSync(content: string) {
        return parseYaml(content);
    }
}