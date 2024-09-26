import fs from 'fs/promises';
import path from 'path';
import { twi } from 'tw-to-css';
import fetch from 'node-fetch';
import { shorthash } from 'astro/runtime/server/shorthash.js';
import typography from '@tailwindcss/typography';
import { EXCLUDED_DIRECTORIES } from './helpers/excludedDirectories';

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

  constructor(config: {
    orderMatters: boolean;
    scannedFileTypes: string[];
    maxLLMInvocations: number;
    prefix: string;
    openaiApiUrl: string;
    tailwindOptions: any;
  }) {
    this.orderMatters = config.orderMatters;
    this.scannedFileTypes = config.scannedFileTypes;
    this.maxLLMInvocations = config.maxLLMInvocations;
    this.prefix = config.prefix;
    this.openaiApiUrl = config.openaiApiUrl;
    this.tailwindOptions = config.tailwindOptions;
  }


/**
 * @param info {{tag: string, class: string}}
 * @returns {string}
 * @example
 * const info = {tag: "div", class: "bg-red-500"};
 * const key = keyForClassname(info.class);
 * console.log(key); // "bg-red-500"
 * @example
 * const info = {tag: "div", class: "bg-red-500"};
 * const key = keyForClassname(info.class);
 * console.log(key); // "bg-red-500"
 *
 */
 getPrompt(info){
    return `Examples:
      {tag: "div", class: "bg-red-500"} -> <result>red-background-container</result>
      {tag: "ul", class: "mt-8 space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-300 xl:mt-10"} -> <result>spaced-list-container</result>
      {tag: "h3", class: "text-lg font-semibold leading-8 text-gray-900 dark:text-white"} -> <result>medium-heading</result>
      {tag: "Link", class: "text-blue-500"} -> <result>blue-link</result>
  
  Given the following info, write a css class name to describe the styles that the tailwind classes apply to the tag.
  Respond with only the class name. Wrap the class name response in <result> tags like this: <result>class-name</result>
  ${JSON.stringify(info)} -> `;
  };
  

    /**
     * Adds file content and paths to the "toWrite" array to be written to disk later. This is done to delay writing to disk until all files have been processed.
     * @param path {string}
     * @param data {string}
     */
     prepareToWrite(path, data) {
        if (toWrite.some((el) => el.path === path)) {
        const index = toWrite.findIndex((el) => el.path === path);
        toWrite[index].data.push(data);
        return;
        } else {
        toWrite.push({ path, data: [data] });
        }
    };

  
  /**
 * Some maps in this script use classnames as keys. This function ensures that the keys are always sorted alphabetically to avoid duplicates.
 *
 *  @param classname {string}
 *  @returns {string}
 *  @example
 *  const classname = "bg-red-500";
 *  const key = keyForClassname(classname);
 *  console.log(key); // "bg-red-500"
 */
  private keyForClassname(classname: string): string {
    return this.orderMatters ? classname : classname.split(' ').sort().join(' ');
  }

  /**
     * Generates a unique class name based on the given info object. The class name is generated using a language model if possible, else a unique hash is used.
     *
     * @param info {{tag: string, class: string}}
     * @returns {Promise<string>}
     * @example
     * const info = {tag: "div", class: "bg-red-500"};
     * const className = await getClassName(info);
     * console.log(className); // "red-background-container"
     */
  private async getClassName(info: TagInfo): Promise<string> {
    if (tailwindClassnameMap.has(keyForClassname(info.class))) {
        return tailwindClassnameMap.get(keyForClassname(info.class));
      }
    
      let out;
      if (info.class.length === info.class.replace(" ", "").length) {
        out = info.class;
      } else if (invocationCountClassName > MAX_LLM_INVOCATIONS) {
        console.log(
          "You have reached the maximum number of invocations for LLM. " +
            MAX_LLM_INVOCATIONS +
            " invocations per run." +
            invocationCountClassName,
        );
        // out = await fetch("https://randomuser.me/api/").then(res => res.json()).then(json => json.results[0].name.first + json.results[0].location.city);
        out = shorthash(info.class) + Math.floor(Math.random() * 10);
      } else {
        //TO USE THIS, YOU MUST USE WRANGLER TO RUN THE CLOUDFLARE WORKER APP IN ./helpers
        out = await fetch(OPENAI_API_URL + encodeURIComponent(getPrompt(info)))
          .then((res) => res.json())
          .then((json) => json.response.response)
          .catch((_) => shorthash(info.class) + Math.floor(Math.random() * 1000)); // todo; this is shite but it works with the shite cache I use for LLM names
        invocationCountClassName++;
      }
    
      out = out.replace(/<result>/g, "").replace(/<\/result>/g, "");
      out.replace("result", "");
      out = out.replace(/[^a-zA-Z0-9-_]/g, "");
    
      out = PREFIX + out;
    
      if (!out || typeof out !== "string" || out.length < 1) {
        console.log("Invalid class name, regenerating...");
        return await getClassName(info);
      }
      if (new Set(tailwindClassnameMap.values()).has(out)) {
        // console.log(`Class name ${out} already exists, regenerating...`);
        out = `${out}-${shorthash(info.class)}`;
      }
    
      tailwindClassnameMap.set(keyForClassname(info.class), out);
      // console.log(`assigned ${info.class} to ${out}. Now tailwind map has ${tailwindClassnameMap.size} keys.`)
      return out;
  }

  /**
 * Generates CSS code based on the given info object. The CSS code is generated using the tailwind-to-css library.
 *
 * TODO: auto optization: combile like parts of CSS to SCSS mixins
 *
 * @param tagInfo {{tag: string, class: string}}
 * @returns {Promise<string>}
 */
  private async getCSSCode(tagInfo: TagInfo): Promise<string> {
    let className = tailwindClassnameMap.has(tagInfo.class)
    ? tailwindClassnameMap.get(tagInfo.class)
    : await getClassName(tagInfo);
  //console.log(`${tagInfo.class} -> ${className}`);
  if (twi(tagInfo.class, TAILWIND_OPTIONS) === "") {
    return "";
  }
  return `
    .${className} {
        /* styles, generated from tailwind: ${tagInfo.class} */
        ${twi(tagInfo.class, TAILWIND_OPTIONS)}
    }`;
  }

    /**
     * Processes the given data and replaces all classnames with the new classnames generated by the getClassName function.
     * @param data the file content
     * @param classNamesToElementsMap maps classnames (generated by keyForClassname) to an array of elements that use that classname (tag, class, file, indexTag, indexClass, lengthTag, lengthClass)
     * @param replaceClassname a function that takes a classname and returns the non-tailwind classnames
     * @param file the file path
     * @returns {*} the modified file content
     */
  private replaceTailwind(data: string, file: string): string {
    let offset = 0;
    const replacementsForThisFile = Array.from(classNamesToElementsMap.values())
      .flat(5)
      .filter((el) => el.file === file)
      .sort((a, b) => a.indexClass - b.indexClass);
    if (filesReplaced.has(file)) {
      return data;
    }
    console.log(
      `replacing ${replacementsForThisFile.length} classnames in ${file}`,
    );
    for (const el of replacementsForThisFile) {
      const indexOfClassname = el.indexClass + offset;
      const indexOfClassnameEnd = indexOfClassname + el.lengthClass;
      const key = keyForClassname(el.class);
  
      const nonTailwindClasses =
        el.class
          .split(" ")
          .filter((classname) => twi(classname, TAILWIND_OPTIONS) === "") || [];
  
      const replacement =
        nonTailwindClasses.length === el.class.split(" ").length
          ? nonTailwindClasses.join(" ")
          : nonTailwindClasses.concat([replaceClassname(key)]).join(" ");
  
      console.log(` - - replacing ${el.class} with ${replacement}`);
  
      data = `${data.slice(0, indexOfClassname)}${replacement}${data.slice(indexOfClassnameEnd)}`; // replace the classname with the new classname
      offset += replacement.length - el.lengthClass;
    }
    filesReplaced.add(file);
    return data;
  }

    /**
   * executes a regex on a string and returns an array of objects with the match, index and length of the match
   * @param data
   * @param regex
   * @returns {*[]}
   */
    private async getIndexedMatches(data, regex) {
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
      };

  /**
   * Replaces all tailwind classes in the given file with new classnames, and writes the styles in the right way for the file type.
   * @param filePath
   * @returns {Promise<void>}
   */
  private async fix(filePath: string): Promise<void> {
        //console.log(filePath);
        let data = await fsp.readFile(filePath, { encoding: "utf-8" });
        // A regex that matches classnames and tags in HTML, Astro, Vue and JSX files
        const regex =
          /(?<=id=")[^"]+|(?<=id=')[^']+|(?<=\[id\]=")[^"]+|(?<=\[id\]=')[^']+|(?<=<)[\w_-]+|(?<=[\[?ng]{0,2}class[Name]{0,4}\]?=")[^"]+|(?<=[\[?ng]{0,2}class[Name]{0,4}\]?=')[^']+|(?<=@include\s)[^\s]+/gim; //TODO: also apply to pages like 404, maybe use a "use-translate" toplevel function
        // As above, but just the tags. Intersect the two arrays to get the tags that have classes
        const regexTags =
          /(?<=id=")[^"]+|(?<=id=')[^']+|(?<=\[id\]=")[^"]+|(?<=\[id\]=')[^']+|(?<=<)[\w_-]+|(?<=@include\s)[^\s]+/gim;
    
        const indexedMatches = getIndexedMatches(data, regex);
        const indexedMatchesTags = getIndexedMatches(data, regexTags);
    
        let classnames = [];
        let idxTagsOnly = 0;
        for (const idxTagsInclClasses in indexedMatches) {
          if (
            idxTagsOnly > indexedMatchesTags.length - 1 ||
            idxTagsInclClasses > indexedMatches.length - 1
          ) {
            break;
          }
          const tagMatchIdx = indexedMatchesTags[idxTagsOnly];
          const classMatchIdx = indexedMatches[idxTagsInclClasses];
          const tagMatch = tagMatchIdx.match;
          const classMatch = classMatchIdx.match;
          if (tagMatch === classMatch) {
            //console.log(`we think that ${tagMatch} is a tag`);
            idxTagsOnly++;
            continue;
          }
          //console.log(`we think that ${tagMatch} is a tag and ${classMatch} is a class`);
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
        // console.dir(classnames);
    
        let classNamesListSet = new Set();
        for (const clss of classnames) {
          const uniqueKey = keyForClassname(clss.class);
          classNamesListSet = classNamesListSet.add(uniqueKey);
          if (!classNamesToElementsMap.has(uniqueKey)) {
            classNamesToElementsMap = classNamesToElementsMap.set(uniqueKey, []);
          }
          classNamesToElementsMap.get(uniqueKey).push(clss);
          // console.log(`added ${uniqueKey} to classNamesToElementsMap which now has ${classNamesToElementsMap.size} keys with ${classNamesToElementsMap.get(uniqueKey).length} elements in this key`);
        }
    
        //console.log(`found ${classNamesListSet.size} unique classnames in ${filePath} with ${Array.from(classNamesListSet).reduce((acc, curr) => acc + classNamesToElementsMap.get(curr).length, 0)} total uses`);
    
        let filesToCSSMap = new Map();
        for (const key of classNamesToElementsMap.keys()) {
          const filesList = classNamesToElementsMap
            .get(key)
            .map((element) => element.file);
          const uniqueFilesList = [...new Set(filesList)];
          const element = classNamesToElementsMap.get(key)[0];
          const css = await getCSSCode({
            tag: element.tag,
            class: element.class,
          });
          for (const file of uniqueFilesList) {
            if (!filesToCSSMap.has(file)) {
              filesToCSSMap.set(file, []);
            }
            filesToCSSMap.get(file).push(css);
          }
        }
    
        for (const file of filesToCSSMap.keys()) {
          if (filesReplaced.has(file)) {
            continue;
          }
          let data = await fsp.readFile(file, { encoding: "utf-8" });
          let css = filesToCSSMap.get(file).join("\n");
    
          const isUsingStyleTag =
            file.endsWith(".astro") ||
            file.endsWith(".html") ||
            file.endsWith(".vue");
    
          // handle astro files
          if (isUsingStyleTag) {
            //tested only on astro, don't know if it works on the others but it should.
    
            data = replaceTailwind(
              data,
              classNamesToElementsMap,
              (classnameUnsorted) => {
                const classname = keyForClassname(classnameUnsorted);
                //console.log(`replacing ${classname} with ${tailwindClassnameMap.get(classname)}`);
                // console.dir(tailwindClassnameMap);
                return tailwindClassnameMap.get(classname);
              },
              file,
            );
          }
    
          // handle tsx files
          else if (file.endsWith(".tsx")) {
            let moduleCSSFile = file.replace(".tsx", ".module.css");
            prepareToWrite(moduleCSSFile, css, { encoding: "utf-8" });
            const styleImportName = `styles_generated_${Math.floor(Math.random() * 100)}`;
            const importCSS = `import ${styleImportName} from "./${path.basename(moduleCSSFile)}";`;
    
            data = replaceTailwind(
              data,
              classNamesToElementsMap,
              (classnameUnsorted) => {
                const classname = keyForClassname(classnameUnsorted);
                return `${styleImportName}.${tailwindClassnameMap.get(classname)}`;
              },
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
    
          prepareToWrite(file, data, { encoding: "utf-8" });
          filesReplaced.add(file);
        }
    }

    /**
   * Recursively traverses a folder and fixes all files in it, ignoring excluded directories and files that are not of the SCANNED_FILE_TYPES
   * @param folder
   * @returns {Promise<void>}
   */
  private async fixTraverse(folder: string): Promise<void> {
    const stat = await fsp.stat(folder);
    if (!stat.isDirectory()) {
      if (SCANNED_FILE_TYPES.some((filetype) => folder.endsWith(filetype))) {
        await fix(folder);
      } else {
        return;
      }
    }
    const files = await fsp.readdir(folder);
    for (const file of files) {
      if (EXCLUDED_DIRECTORIES.includes(file)) {
        continue;
      }
      const filePath = path.join(folder, file);
      const stat = await fsp.stat(filePath);
      if (stat.isDirectory()) {
        await fixTraverse(filePath);
      } else {
        if (
          SCANNED_FILE_TYPES.some(
            (filetype) => stat.isFile() && file.endsWith(filetype),
          )
        ) {
          await fix(filePath);
        }
      }
    }
  };  }

  public async run(rootDir: string): Promise<void> {
    const allFolders = await fs.readdir(rootDir);
    for (const folder of allFolders) {
      if (!EXCLUDED_DIRECTORIES.includes(folder)) {
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