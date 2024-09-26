import fs from 'fs/promises';
import path from 'path';
import { twi } from 'tw-to-css';
import fetch from 'node-fetch';
import { shorthash } from 'astro/runtime/server/shorthash.js';

/*TODO:
    [ ] Retailwind is possible using comments in classes.. could make that scirpt.
    [ ] use a hash based lockfile modificaiton management system like in auto_i18n_blog.js
    [ ] add a flag to use GPT or not
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
}

export class TailwindKiller {
  private orderMatters: boolean;
  private scannedFileTypes: string[];
  private maxLLMInvocations: number;
  private prefix: string;
  private openaiApiUrl: string;
  private tailwindOptions: any;
  private invocationCountClassName: number = 0;
  private tailwindClassnameMap: Map<string, string> = new Map();
  private classNamesToElementsMap: Map<string, FileReplacement[]> = new Map();
  private filesReplaced: Set<string> = new Set();
  private toWrite: { path: string; data: string[] }[] = [];
  private excludedDirectories: string[] = []

  constructor(config: {
    orderMatters: boolean;
    scannedFileTypes: string[];
    maxLLMInvocations: number;
    prefix: string;
    openaiApiUrl: string;
    tailwindOptions: any;
    excludedDirectories: string[];
  }) {
    this.orderMatters = config.orderMatters;
    this.scannedFileTypes = config.scannedFileTypes;
    this.maxLLMInvocations = config.maxLLMInvocations;
    this.prefix = config.prefix;
    this.openaiApiUrl = config.openaiApiUrl;
    this.tailwindOptions = config.tailwindOptions;
    this.excludedDirectories = config.excludedDirectories;
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

  private prepareToWrite(path: string, data: string): void {
    if (this.toWrite.some((el) => el.path === path)) {
      const index = this.toWrite.findIndex((el) => el.path === path);
      this.toWrite[index].data.push(data);
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

    let out;
    if (info.class.length === info.class.replace(" ", "").length) {
      out = info.class;
    } else if (this.invocationCountClassName > this.maxLLMInvocations) {
      console.log(
        "You have reached the maximum number of invocations for LLM. " +
          this.maxLLMInvocations +
          " invocations per run." +
          this.invocationCountClassName,
      );
      out = shorthash(info.class) + Math.floor(Math.random() * 10);
    } else {
      out = await fetch(this.openaiApiUrl + encodeURIComponent(this.getPrompt(info)))
        .then((res) => res.json())
        // @ts-ignore
        .then((json) => json.response.response)
        .catch((_) => shorthash(info.class) + Math.floor(Math.random() * 1000));
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

  private async getCSSCode(tagInfo: TagInfo): Promise<string> {
    let className = this.tailwindClassnameMap.has(tagInfo.class)
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
    let offset = 0;
    const replacementsForThisFile = Array.from(this.classNamesToElementsMap.values())
      .flat(5)
      .filter((el) => el.file === file)
      .sort((a, b) => a.indexClass - b.indexClass);
    if (this.filesReplaced.has(file)) {
      return data;
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

      data = `${data.slice(0, indexOfClassname)}${replacement}${data.slice(indexOfClassnameEnd)}`;
      offset += replacement.length - el.lengthClass;
    }
    this.filesReplaced.add(file);
    return data;
  }

  private async getIndexedMatches(data: string, regex: RegExp): Promise<{ match: string; index: number; length: number }[]> {
    let match;
    let out = [];
    while ((match = regex.exec(data)) !== null) {
      out.push({
        match: match[0],
        index: match.index,
        length: match[0].length,
      });
    }
    return out;
  }

  private async fix(filePath: string): Promise<void> {
    let data = await fs.readFile(filePath, { encoding: "utf-8" });
    const regex =
      /(?<=id=")[^"]+|(?<=id=')[^']+|(?<=\[id\]=")[^"]+|(?<=\[id\]=')[^']+|(?<=<)[\w_-]+|(?<=[\[?ng]{0,2}class[Name]{0,4}\]?=")[^"]+|(?<=[\[?ng]{0,2}class[Name]{0,4}\]?=')[^']+|(?<=@include\s)[^\s]+/gim;
    const regexTags =
      /(?<=id=")[^"]+|(?<=id=')[^']+|(?<=\[id\]=")[^"]+|(?<=\[id\]=')[^']+|(?<=<)[\w_-]+|(?<=@include\s)[^\s]+/gim;

    const indexedMatches = await this.getIndexedMatches(data, regex);
    const indexedMatchesTags = await this.getIndexedMatches(data, regexTags);

    let classnames = [];
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

    let classNamesListSet = new Set();
    for (const clss of classnames) {
      const uniqueKey = this.keyForClassname(clss.class);
      classNamesListSet = classNamesListSet.add(uniqueKey);
      if (!this.classNamesToElementsMap.has(uniqueKey)) {
        this.classNamesToElementsMap.set(uniqueKey, []);
      }
      this.classNamesToElementsMap.get(uniqueKey)!.push(clss);
    }
    let filesToCSSMap = new Map();
    for (const key of Array.from(this.classNamesToElementsMap.keys())) {
      const filesList = this.classNamesToElementsMap
        .get(key)!
        .map((element) => element.file);
      const uniqueFilesList = Array.from(new Set(filesList));
      const element = this.classNamesToElementsMap.get(key)![0];
      const css = await this.getCSSCode({
        tag: element.tag,
        class: element.class,
      });
      for (const file of uniqueFilesList) {
        if (!filesToCSSMap.has(file)) {
          filesToCSSMap.set(file, []);
        }
        filesToCSSMap.get(file)!.push(css);
      }
    }

    for (const file of Array.from(filesToCSSMap.keys())) {
      if (this.filesReplaced.has(file)) {
        continue;
      }
      let data = await fs.readFile(file, { encoding: "utf-8" });
      let css = filesToCSSMap.get(file)!.join("\n");

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
        let moduleCSSFile = file.replace(".tsx", ".module.css");
        this.prepareToWrite(moduleCSSFile, css);
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

      this.prepareToWrite(file, data);
      this.filesReplaced.add(file);
    }
  }

  private async fixTraverse(folder: string): Promise<void> {
    const stat = await fs.stat(folder);
    if (!stat.isDirectory()) {
      if (this.scannedFileTypes.some((filetype) => folder.endsWith(filetype))) {
        await this.fix(folder);
      } else {
        return;
      }
    }
    const files = await fs.readdir(folder);
    for (const file of files) {
      if (this.excludedDirectories.includes(file)) {
        continue;
      }
      const filePath = path.join(folder, file);
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        await this.fixTraverse(filePath);
      } else {
        if (
          this.scannedFileTypes.some(
            (filetype) => stat.isFile() && file.endsWith(filetype),
          )
        ) {
          await this.fix(filePath);
        }
      }
    }
  }

  public async run(rootDir: string): Promise<void> {
    const allFolders = await fs.readdir(rootDir);
    for (const folder of allFolders) {
      if (!this.excludedDirectories.includes(folder)) {
        await this.fixTraverse(path.join(rootDir, folder));
      }
    }

    console.log("Writing to disk...");
    for (const write of this.toWrite) {
      for (const data of write.data) {
        console.log(`Writing ${data.length} chars to ${write.path}`);
        await fs.writeFile(write.path, data, { encoding: 'utf-8' });
      }
    }
  }
}