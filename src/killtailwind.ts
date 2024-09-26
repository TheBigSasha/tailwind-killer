import fs from 'fs';
import * as fsPromises from 'fs/promises';
import path from 'path';
import { twi } from 'tw-to-css';
import fetch from 'node-fetch';
import { createHash } from 'crypto';

// Simple shorthash function implementation
function shorthash(text: string): string {
  return createHash('md5').update(text).digest('hex').slice(0, 8);
}

/*TODO:
    [ ] Retailwind is possible using comments in classes.. could make that scirpt.
    [?] use a hash based lockfile modificaiton management system like in auto_i18n_blog.js
    [?] add a flag to use GPT or not
    [ ] Move configuration to a config file
    [ ] Failed conversion in `logos.astro` "				<img class="col-span-2 max-h-12 w-full object-contain lg:col-span-1 dark:invert" src={src} alt={alt} width="158" height="48" />" inside a map satatement
    [ ] Publish as a package
 */

interface TagInfo {
  tag: string;
  class: string;
}

interface FileReplacement {
  file: string;
  indexClass: number;
  lengthClass: number;
  class: string;
  tag?: string;
}

export interface TailwindKillerConfig {
  orderMatters: boolean;
  scannedFileTypes: string[];
  maxLLMInvocations: number;
  prefix: string;
  openaiApiUrl: string;
  tailwindOptions: Record<string, unknown>;
  excludedDirectories: string[];
  lockfilePath: string;
  useLLM: boolean;
}

interface WriteItem {
  path: string;
  data: string[];
}

export class TailwindKiller {
  private orderMatters: boolean;
  private scannedFileTypes: string[];
  private maxLLMInvocations: number;
  private prefix: string;
  private openaiApiUrl: string;
  private tailwindOptions: Record<string, unknown>;
  private invocationCountClassName = 0;
  private tailwindClassnameMap = new Map<string, string>();
  private classNamesToElementsMap = new Map<string, FileReplacement[]>();
  private filesReplaced = new Set<string>();
  private toWrite: WriteItem[] = [];
  private excludedDirectories: string[] = []
  private lockfile: Record<string, Record<string, any>> = {};
  private useLLM: boolean;

  constructor(config: TailwindKillerConfig) {
    this.orderMatters = config.orderMatters;
    this.scannedFileTypes = config.scannedFileTypes;
    this.maxLLMInvocations = config.maxLLMInvocations;
    this.prefix = config.prefix;
    this.openaiApiUrl = config.openaiApiUrl;
    this.tailwindOptions = config.tailwindOptions;
    this.excludedDirectories = config.excludedDirectories;
    this.useLLM = config.useLLM;
    this.loadLockfile(config.lockfilePath);
  }

  private getPrompt(info: TagInfo): string {
    return `Examples:
      {tag: "div", class: "bg-red-500"} -> <result>red-background-container</result>
      {tag: "ul", class: "mt-8 space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-300 xl:mt-10"} -> <result>spaced-list-container</result>
      {tag: "h3", class: "text-lg font-semibold leading-8 text-gray-900 dark:text-white"} -> <result>medium-heading</result>
      {tag: "Link", class: "text-blue-500"} -> <result>blue-link</result>
  
  Given the following info, write a css class name to describe the styles that the tailwind classes apply to the tag.
  Respond with only the class name. Wrap the class name response in <result> tags like this: <result>class-name</result>
  ${JSON.stringify(info)} -> `;
  }

  public addToWrite(path: string, data: string) {
    const index = this.toWrite.findIndex(item => item.path === path);
    if (index !== -1) {
      this.toWrite[index]?.data.push(data);
    } else {
      this.toWrite.push({ path, data: [data] });
    }
  }

  private keyForClassname(classname: string): string {
    return this.orderMatters ? classname : classname.split(' ').sort().join(' ');
  }

  private async getClassName(info: TagInfo): Promise<string> {
    if (this.tailwindClassnameMap.has(this.keyForClassname(info.class))) {
      return this.tailwindClassnameMap.get(this.keyForClassname(info.class))!;
    }

    let out: string;

    if (info.class.length === info.class.replace(" ", "").length) {
      out = info.class;
    } else if (!this.useLLM || this.invocationCountClassName > this.maxLLMInvocations) {
      out = this.generateHashBasedClassName(info.class);
    } else {
      out = await this.getLLMGeneratedClassName(info);
      this.invocationCountClassName++;
    }

    out = out.replace(/<result>/g, "").replace(/<\/result>/g, "");
    out.replace("result", "");
    out = out.replace(/[^a-zA-Z0-9-_]/g, "");

    out = this.prefix + out;

    if (!out || typeof out !== "string" || out.length < 1) {
      console.log("Invalid class name, regenerating...");
      return await this.getClassName(info);
    }
    if (new Set(this.tailwindClassnameMap.values()).has(out)) {
      out = `${out}-${shorthash(info.class)}`;
    }

    this.tailwindClassnameMap.set(this.keyForClassname(info.class), out);
    return out;
  }

  private generateHashBasedClassName(className: string): string {
    return `${this.prefix}${shorthash(className)}${Math.floor(Math.random() * 1000)}`;
  }

  private async getLLMGeneratedClassName(info: TagInfo): Promise<string> {
    try {
      const response = await fetch(this.openaiApiUrl + encodeURIComponent(this.getPrompt(info)));
      const json = await response.json() as { response: { response: string } };
      return json.response.response;
    } catch (error) {
      console.error('Error generating class name:', error);
      return this.generateHashBasedClassName(info.class);
    }
  }

  private async getCSSCode(tagInfo: TagInfo): Promise<string> {
    const className = this.tailwindClassnameMap.has(tagInfo.class)
      ? this.tailwindClassnameMap.get(tagInfo.class)!
      : await this.getClassName(tagInfo);
    if (twi(tagInfo.class, this.tailwindOptions) === "") {
      return "";
    }
    return `
    .${className} {
        /* styles, generated from tailwind: ${tagInfo.class} */
        ${twi(tagInfo.class, this.tailwindOptions)}
    }`;
  }

  private replaceTailwind(data: string, file: string): string {
    let modifiedData = data;
    let offset = 0;  // Changed from const to let
    const replacementsForThisFile = Array.from(this.classNamesToElementsMap.values())
      .flat(5)
      .filter((el) => el.file === file)
      .sort((a, b) => a.indexClass - b.indexClass);
    if (this.filesReplaced.has(file)) {
      return modifiedData;
    }
    console.log(
      `replacing ${replacementsForThisFile.length} classnames in ${file}`,
    );
    for (const el of replacementsForThisFile) {
      const indexOfClassname = el.indexClass + offset;
      const indexOfClassnameEnd = indexOfClassname + el.lengthClass;
      const key = this.keyForClassname(el.class);

      const nonTailwindClasses =
        el.class
          .split(" ")
          .filter((classname) => twi(classname, this.tailwindOptions) === "") || [];

      const replacement =
        nonTailwindClasses.length === el.class.split(" ").length
          ? nonTailwindClasses.join(" ")
          : nonTailwindClasses.concat([this.tailwindClassnameMap.get(key)!]).join(" ");

      console.log(` - - replacing ${el.class} with ${replacement}`);

      modifiedData = `${modifiedData.slice(0, indexOfClassname)}${replacement}${modifiedData.slice(indexOfClassnameEnd)}`;
      offset += replacement.length - el.lengthClass;
    }
    this.filesReplaced.add(file);
    return modifiedData;
  }

  private async getIndexedMatches(data: string, regex: RegExp): Promise<{ match: string; index: number; length: number }[]> {
    let match;
    const out = [];
    while ((match = regex.exec(data)) !== null) {
      out.push({
        match: match[0],
        index: match.index,
        length: match[0].length,
      });
    }
    return out;
  }

  private hashFn(content: string): string {
    return createHash('md5').update(content).digest('hex');
  }

  private loadLockfile(lockfilePath: string): void {
    try {
      this.lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf-8'));
    } catch (error) {
      console.warn('Failed to load lockfile, starting with an empty one');
      this.lockfile = {};
    }
  }

  public saveLockfile(lockfilePath: string): void {
    fs.writeFileSync(lockfilePath, JSON.stringify(this.lockfile, null, 2));
  }

  private lockFileModification(file: string, originalContent: string, modifiedContent: string): void {
    const hash = this.hashFn(originalContent);
    const hashModified = this.hashFn(modifiedContent);
    
    if (!this.lockfile[file]) {
      this.lockfile[file] = {};
    }
    
    this.lockfile[file] = {
      hash,
      hashModified,
      modified: Date.now(),
      algorithm: 'TailwindKiller',
    };
  }

  private isFileModified(file: string, content: string): boolean {
    if (!this.lockfile[file]) {
      return true;
    }
    
    const currentHash = this.hashFn(content);
    return currentHash !== this.lockfile[file].hash && currentHash !== this.lockfile[file].hashModified;
  }

  async fix(filePath: string): Promise<void> {
    const data = await fsPromises.readFile(filePath, { encoding: "utf-8" });
    
    if (!this.isFileModified(filePath, data)) {
      console.log(`File ${filePath} has not been modified since last run. Skipping.`);
      return;
    }

    const regex =
      /(?<=id=")[^"]+|(?<=id=')[^']+|(?<=\[id\]=")[^"]+|(?<=\[id\]=')[^']+|(?<=<)[\w_-]+|(?<=(?:\[?ng)?class(?:Name)?\]?=")[^"]+|(?<=(?:\[?ng)?class(?:Name)?\]?=')[^']+|(?<=@include\s)[^\s]+/gim;
    const regexTags =
      /(?<=id=")[^"]+|(?<=id=')[^']+|(?<=\[id\]=")[^"]+|(?<=\[id\]=')[^']+|(?<=<)[\w_-]+|(?<=@include\s)[^\s]+/gim;

    const indexedMatches = await this.getIndexedMatches(data, regex);
    const indexedMatchesTags = await this.getIndexedMatches(data, regexTags);

    const classnames = [];
    let idxTagsOnly = 0;
    for (const idxTagsInclClasses in indexedMatches) {
      if (
        Number(idxTagsOnly) > indexedMatchesTags.length - 1 ||
        Number(idxTagsInclClasses) > indexedMatches.length - 1
      ) {
        break;
      }
      const tagMatchIdx = indexedMatchesTags[idxTagsOnly];
      const classMatchIdx = indexedMatches[idxTagsInclClasses];
      if (tagMatchIdx && classMatchIdx) {
        const tagMatch = tagMatchIdx.match;
        const classMatch = classMatchIdx.match;
        if (tagMatch === classMatch) {
          idxTagsOnly++;
          continue;
        }
        classnames.push({
          tag: tagMatch,
          class: classMatch,
          file: filePath,
          indexTag: tagMatchIdx.index,
          indexClass: classMatchIdx.index,
          lengthTag: tagMatchIdx.length,
          lengthClass: classMatchIdx.length,
        });
      }
    }

    let classNamesListSet = new Set();
    for (const clss of classnames) {
      const uniqueKey = this.keyForClassname(clss.class);
      classNamesListSet = classNamesListSet.add(uniqueKey);
      if (!this.classNamesToElementsMap.has(uniqueKey)) {
        this.classNamesToElementsMap.set(uniqueKey, []);
      }
      this.classNamesToElementsMap.get(uniqueKey)!.push(clss);
    }
    const filesToCSSMap = new Map();
    for (const key of Array.from(this.classNamesToElementsMap.keys())) {
      const filesList = this.classNamesToElementsMap
        .get(key)!
        .map((element) => element.file);
      const uniqueFilesList = Array.from(new Set(filesList));
      const element = this.classNamesToElementsMap.get(key)![0];
      if (element) {
        const css = await this.getCSSCode({
          tag: element.tag || '', // Add a fallback empty string
          class: element.class,
        });
        for (const file of uniqueFilesList) {
          if (!filesToCSSMap.has(file)) {
            filesToCSSMap.set(file, []);
          }
          filesToCSSMap.get(file)!.push(css);
        }
      }
    }

    for (const file of Array.from(filesToCSSMap.keys())) {
      if (this.filesReplaced.has(file)) {
        continue;
      }
      let data = await fsPromises.readFile(file, { encoding: "utf-8" });
      const css = filesToCSSMap.get(file)!.join("\n");

      const isUsingStyleTag =
        file.endsWith(".astro") ||
        file.endsWith(".html") ||
        file.endsWith(".vue");

      if (isUsingStyleTag) {
        data = this.replaceTailwind(
          data,
          file,
        );
      } else if (file.endsWith(".tsx")) {
        const moduleCSSFile = file.replace(".tsx", ".module.css");
        this.addToWrite(moduleCSSFile, css);
        const styleImportName = `styles_generated_${Math.floor(Math.random() * 100)}`;
        const importCSS = `import ${styleImportName} from "./${path.basename(moduleCSSFile)}";`;

        data = this.replaceTailwind(
          data,
          file,
        );
        data = `${importCSS}\n${data}`;
      }

      if (isUsingStyleTag) {
        if (data.includes("<style>")) {
          data = data.replace("<style>", `<style>${css}`);
        } else if (data.includes("</head>")) {
          data = data.replace("</head>", `<style>${css}</style></head>`);
        } else {
          data = `${data}${"\n"}<style>${css}</style>`;
        }
      }

      const modifiedData = this.replaceTailwind(data, file);
      this.lockFileModification(file, data, modifiedData);
      this.addToWrite(file, modifiedData);
    }

    // After processing, add the modified content to be written
    this.addToWrite(filePath, data);
  }

  public async run(rootDir: string, lockfilePath: string): Promise<void> {
    this.loadLockfile(lockfilePath);
    await this.fixTraverse(rootDir, lockfilePath);
    this.saveLockfile(lockfilePath);
  }

  private async fixTraverse(folder: string, lockfilePath: string): Promise<void> {
    const files = await fsPromises.readdir(folder, { withFileTypes: true });
    for (const file of files) {
      if (this.excludedDirectories.includes(file.name)) {
        continue;
      }
      const filePath = path.join(folder, file.name);
      if (file.isDirectory()) {
        await this.fixTraverse(filePath, lockfilePath);
      } else if (file.isFile() && this.scannedFileTypes.some(ext => file.name.endsWith(ext))) {
        await this.fix(filePath);
      }
    }

    console.log("Writing to disk...");
    for (const write of this.toWrite) {
      for (const data of write.data) {
        console.log(`Writing ${data.length} chars to ${write.path}`);
        await fsPromises.writeFile(write.path, data, { encoding: 'utf-8' });
      }
    }

    this.saveLockfile(lockfilePath);
  }
}