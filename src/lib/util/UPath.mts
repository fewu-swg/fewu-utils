import type { SepChar, SepType } from '@fewu-swg/abstract-types';

class UPath {
  public sep: SepChar;
  public strings: string[];

  constructor(path: string, sep: SepType) {
    if (!sep) {
      throw new Error('sep parameter is required');
    }

    let actualSep: SepChar;
    
    if (sep === 'auto') {
      actualSep = this.autoDetectSep(path);
    } else if (sep === 'win32') {
      actualSep = '\\';
    } else if (sep === 'unix' || sep === 'url') {
      actualSep = '/';
    } else {
      actualSep = sep;
    }

    this.sep = actualSep;
    this.strings = this.splitPath(path, actualSep);
  }

  private autoDetectSep(path: string): SepChar {
    // 统计两种分隔符的出现次数
    const forwardSlashCount = (path.match(/\//g) || []).length;
    const backslashCount = (path.match(/\\/g) || []).length;

    // 如果都有出现，优先使用出现次数多的
    if (forwardSlashCount > 0 && backslashCount > 0) {
      return forwardSlashCount >= backslashCount ? '/' : '\\';
    }
    
    // 如果只有一种分隔符，使用该分隔符
    if (forwardSlashCount > 0) return '/';
    if (backslashCount > 0) return '\\';

    // 如果都没有，使用当前平台默认分隔符
    return this.getPlatformSep();
  }

  private getPlatformSep(): SepChar {
    // 判断当前平台
    if (typeof process !== 'undefined' && process.platform === 'win32') {
      return '\\';
    }
    return '/';
  }

  private splitPath(path: string, sep: SepChar): string[] {
    if (!path) return [];
    
    // 使用正则表达式分割路径，处理连续的分隔符
    const separator = sep === '/' ? /\// : /\\/;
    const parts = path.split(separator).filter(part => part !== '');
    
    // 处理绝对路径的情况
    if (sep === '/' && path.startsWith('/')) {
      return ['', ...parts]; // Unix绝对路径，第一个空字符串表示根目录
    } else if (sep === '\\' && /^[A-Za-z]:\\/.test(path)) {
      // Windows绝对路径，保持盘符
      return parts;
    }
    
    return parts;
  }

  toString(sep?: SepType): string {
    let outputSep: SepChar;
    
    if (!sep) {
      outputSep = this.sep;
    } else if (sep === 'win32') {
      outputSep = '\\';
    } else if (sep === 'unix' || sep === 'url') {
      outputSep = '/';
    } else if (sep === 'auto' ) {
        outputSep = this.sep;
    } else {
      outputSep = sep;
    }

    // 处理绝对路径的情况
    if (this.strings.length > 0 && this.strings[0] === '') {
      // Unix绝对路径
      return '/' + this.strings.slice(1).join(outputSep);
    } else if (this.strings.length > 0 && /^[A-Za-z]:$/.test(this.strings[0])) {
      // Windows绝对路径（盘符）
      return this.strings[0] + outputSep + this.strings.slice(1).join(outputSep);
    }

    return this.strings.join(outputSep);
  }

  join(...paths: string[]): UPath {
    const newStrings = [...this.strings];
    
    for (const path of paths) {
      const tempPath = new UPath(path, 'auto');
      newStrings.push(...tempPath.strings);
    }
    
    const newUPath = new UPath('', this.sep);
    newUPath.strings = newStrings;
    return newUPath;
  }

  basename(): string {
    return this.strings.length > 0 ? this.strings[this.strings.length - 1] : '';
  }

  dirname(): UPath {
    if (this.strings.length <= 1) {
      const newUPath = new UPath('', this.sep);
      newUPath.strings = this.strings[0] === '' ? [''] : [];
      return newUPath;
    }
    
    const newUPath = new UPath('', this.sep);
    newUPath.strings = this.strings.slice(0, -1);
    return newUPath;
  }

  extname(): string {
    const basename = this.basename();
    const lastDotIndex = basename.lastIndexOf('.');
    
    if (lastDotIndex > 0 && lastDotIndex < basename.length - 1) {
      return basename.substring(lastDotIndex);
    }
    
    return '';
  }
}

export { UPath };
export type { SepChar, SepType };