import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve, join, relative } from 'path';
import { readFile, access } from 'fs/promises';
import { constants } from 'fs';
import * as semver from 'semver';
import { Console } from '../Console.mjs';

const execAsync = promisify(exec);

interface PackageInfo {
  name: string;
  version: string;
  path: string;
  entryPath?: string;
}

interface DependencyNode {
  name?: string;
  version?: string;
  path?: string;
  dependencies?: Record<string, any>; // 放宽类型以便处理各种格式
}

class NodeModulePM {
  private projectDir: string;
  private packageCache: Map<string, PackageInfo> = new Map();
  private entryCache: Map<string, string> = new Map();
  private isInitialized = false;

  constructor(projectDir: string) {
    this.projectDir = resolve(projectDir);
  }

  /**
   * 初始化包缓存
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      
      // 检查 node_modules 是否存在
      const nodeModulesPath = join(this.projectDir, 'node_modules');
      try {
        await access(nodeModulesPath, constants.R_OK);
      } catch {
        throw new Error(`node_modules 目录不存在或不可读: ${nodeModulesPath}`);
      }

      const packageList = await this.getPackageList();
      
      const allPackages = this.extractAllPackages(packageList);
      
      this.packageCache = this.filterLatestVersions(allPackages);
      
      this.isInitialized = true;
    } catch (error) {
      throw new Error(`初始化包管理器失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取所有包的真实路径
   */
  async getAllPackagePaths(): Promise<string[]> {
    await this.ensureInitialized();
    return Array.from(this.packageCache.values()).map(pkg => pkg.path);
  }

  /**
   * 获取指定包的入口脚本路径
   */
  async getPackageEntry(packageName: string): Promise<string | null> {
    await this.ensureInitialized();

    if (this.entryCache.has(packageName)) {
      return this.entryCache.get(packageName)!;
    }

    const pkgInfo = this.packageCache.get(packageName);
    if (!pkgInfo) {
      Console.warn(`未找到包: ${packageName}`);
      return null;
    }

    try {
      const entryPath = await this.resolvePackageEntry(pkgInfo.path);
      this.entryCache.set(packageName, entryPath);
      pkgInfo.entryPath = entryPath;
      return entryPath;
    } catch (error) {
      Console.warn(`无法解析包 ${packageName} 的入口:`, error as Error);
      return null;
    }
  }

  /**
   * 获取包信息映射
   */
  getPackageMap(): Map<string, PackageInfo> {
    return new Map(this.packageCache);
  }

  /**
   * 执行包管理器list命令获取依赖信息
   */
  private async getPackageList(): Promise<DependencyNode[]> {
    const commands = [
      'pnpm list --json --depth=Infinity',
      'npm list --json --depth=Infinity --all',
      'yarn list --json --depth=Infinity --no-progress'
    ];

    let stdout: string | null = null;
    let usedCommand = '';

    for (const command of commands) {
      try {
        const result = await execAsync(command, {
          cwd: this.projectDir,
          maxBuffer: 1024 * 1024 * 10,
          encoding: 'utf8' as const
        });
        stdout = result.stdout.trim();
        usedCommand = command;
        break;
      } catch (error: any) {
        // 某些包管理器在部分错误时仍有输出
        if (error.stdout && error.stdout.trim()) {
          stdout = error.stdout.trim();
          usedCommand = command;
          Console.warn(`使用错误输出中的 stdout: ${command}`);
          break;
        }
        continue;
      }
    }

    if (!stdout) {
      throw new Error('所有包管理器命令都执行失败');
    }

    try {
      let result;
      
      // 处理不同包管理器的输出格式
      if (usedCommand.startsWith('yarn')) {
        // yarn 输出可能是多行 JSON
        const lines = stdout.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            try {
              result = JSON.parse(line.trim());
              break;
            } catch {
              continue;
            }
          }
        }
        if (!result) {
          throw new Error('无法解析 yarn 输出');
        }
        result = [result];
      } else {
        result = JSON.parse(stdout);
      }
      
      // 统一返回数组格式
      if (Array.isArray(result)) {
        return result;
      } else {
        return [result];
      }
    } catch (error) {
      Console.error('解析包管理器输出失败:', error as Error);
      Console.info('原始输出前500字符:', stdout.substring(0, 500));
      throw new Error(`解析包管理器输出失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从依赖树中提取所有包信息 - 彻底修复版本
   */
  private extractAllPackages(nodes: DependencyNode[]): PackageInfo[] {
    const packages: PackageInfo[] = [];
    const visited = new Set<string>();

    /**
     * 递归遍历依赖树 - 修复依赖处理
     */
    const traverse = (node: any, depth = 0): void => {
      if (!node || typeof node !== 'object') {
        return;
      }

      // 调试信息 - 显示当前节点
      if (depth <= 3) { // 只显示前几层避免日志过多
      }

      // 检查当前节点是否是一个有效的包
      if (this.isValidPackageNode(node)) {
        const packageInfo = this.createPackageInfo(node);
        const key = `${packageInfo.name}@${packageInfo.version}:${packageInfo.path}`;
        
        if (!visited.has(key)) {
          visited.add(key);
          packages.push(packageInfo);
        }
      }

      // 递归处理依赖 - 修复：处理各种可能的依赖结构
      this.processDependencies(node, depth, traverse);
    };

    // 遍历所有根节点
    nodes.forEach((node, index) => {
      traverse(node);
    });

    return packages;
  }

  /**
   * 检查节点是否是有效的包节点
   */
  private isValidPackageNode(node: any): boolean {
    // 基本验证
    if (!node || typeof node !== 'object') {
      return false;
    }

    const hasName = node.name && typeof node.name === 'string' && node.name !== '';
    const hasVersion = node.version && typeof node.version === 'string' && node.version !== '';
    const hasPath = node.path && typeof node.path === 'string' && node.path !== '';

    // 必须包含名称和版本，路径可选但推荐有
    if (!hasName || !hasVersion) {
      return false;
    }

    // 排除根项目（路径等于项目目录）
    if (node.path && resolve(node.path) === this.projectDir) {
      return false;
    }

    // 优先选择有路径的节点，但如果没有路径我们也可以处理
    return true;
  }

  /**
   * 创建包信息对象
   */
  private createPackageInfo(node: any): PackageInfo {
    let packagePath = node.path;

    // 如果没有路径，尝试从其他字段推断
    if (!packagePath) {
      packagePath = this.inferPackagePath(node);
    }

    // 确保路径是绝对路径
    if (packagePath && !packagePath.startsWith('/')) {
      packagePath = resolve(this.projectDir, packagePath);
    }

    return {
      name: node.name,
      version: node.version,
      path: packagePath || join(this.projectDir, 'node_modules', node.name)
    };
  }

  /**
   * 推断包路径
   */
  private inferPackagePath(node: any): string {
    // 尝试从 resolved 字段解析
    if (node.resolved) {
      const match = node.resolved.match(/file:(.+?)(?:\/node_modules\/|$)/);
      if (match) {
        return resolve(this.projectDir, match[1]);
      }
    }

    // 默认路径
    return join(this.projectDir, 'node_modules', node.name);
  }

  /**
   * 处理依赖关系 - 修复各种依赖结构
   */
  private processDependencies(node: any, depth: number, traverse: (node: any, depth: number) => void): void {
    if (!node.dependencies) {
      return;
    }

    const dependencies = node.dependencies;
    
    // 处理不同类型的依赖结构
    if (Array.isArray(dependencies)) {
      // 数组结构
      dependencies.forEach((dep, index) => {
        if (dep && typeof dep === 'object') {
          traverse(dep, depth + 1);
        }
      });
    } else if (typeof dependencies === 'object') {
      // 对象结构 - 处理不同包管理器的格式
      Object.entries(dependencies).forEach(([key, dep]) => {
        if (dep && typeof dep === 'object') {
          // 确保依赖对象有名称（使用键作为后备）
          //@ts-ignore
          if (!dep.name && key) {
            //@ts-ignore
            dep.name = key;
          }
          traverse(dep, depth + 1);
        }
      });
    }
  }

  /**
   * 过滤包，只保留每个包的最新版本
   */
  private filterLatestVersions(packages: PackageInfo[]): Map<string, PackageInfo> {
    const packageMap = new Map<string, PackageInfo>();
    const versionMap = new Map<string, PackageInfo[]>();

    // 按包名分组
    for (const pkg of packages) {
      if (!versionMap.has(pkg.name)) {
        versionMap.set(pkg.name, []);
      }
      versionMap.get(pkg.name)!.push(pkg);
    }

    // 为每个包选择最新版本
    for (const [name, versions] of versionMap) {
      if (versions.length === 0) continue;

      if (versions.length === 1) {
        packageMap.set(name, versions[0]);
        continue;
      }

      // 使用 semver 比较版本
      const validVersions = versions.filter(v => semver.valid(v.version));
      const invalidVersions = versions.filter(v => !semver.valid(v.version));

      let latestPkg: PackageInfo;

      if (validVersions.length > 0) {
        validVersions.sort((a, b) => semver.rcompare(a.version, b.version));
        latestPkg = validVersions[0];
      } else if (invalidVersions.length > 0) {
        // 如果没有有效版本，选择路径最具体的（通常是最深的）
        invalidVersions.sort((a, b) => b.path.split('/').length - a.path.split('/').length);
        latestPkg = invalidVersions[0];
      } else {
        continue;
      }

      packageMap.set(name, latestPkg);
    }

    return packageMap;
  }

  /**
   * 解析包的入口文件路径
   */
  private async resolvePackageEntry(packagePath: string): Promise<string> {
    const packageJsonPath = join(packagePath, 'package.json');
    
    try {
      await access(packageJsonPath, constants.R_OK);
      const content = await readFile(packageJsonPath, 'utf8');
      const pkg = JSON.parse(content);
      
      // 解析入口字段，优先级：module -> main -> index.js
      let mainFile = pkg.module || pkg.main || 'index.js';
      
      // 处理目录情况
      if (!mainFile.includes('.') && !mainFile.endsWith('/')) {
        const potentialFile = join(packagePath, mainFile + '.js');
        try {
          await access(potentialFile, constants.R_OK);
          mainFile = mainFile + '.js';
        } catch {
          mainFile = join(mainFile, 'index.js');
        }
      }
      
      const entryPath = join(packagePath, mainFile);
      await access(entryPath, constants.R_OK);
      return entryPath;
    } catch (error) {
      // 尝试常见的入口文件
      const commonEntries = [
        'index.js',
        'index.mjs',
        'src/index.js',
        'dist/index.js',
        'lib/index.js',
        'build/index.js'
      ];
      
      for (const entry of commonEntries) {
        const entryPath = join(packagePath, entry);
        try {
          await access(entryPath, constants.R_OK);
          return entryPath;
        } catch {
          continue;
        }
      }
      
      throw new Error(`无法找到包的入口文件: ${packagePath}`);
    }
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }
}

export default NodeModulePM;