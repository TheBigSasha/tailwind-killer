import { TailwindKiller, TailwindKillerConfig } from './killtailwind';
import fs from 'fs';
import * as fsPromises from 'fs/promises';
// import path from 'path';
// import { PNG } from 'pngjs';
// import pixelmatch from 'pixelmatch';
// import puppeteer from 'puppeteer';

// Mock external dependencies
jest.mock('fs');
jest.mock('fs/promises');
jest.mock('node-fetch', () => jest.fn());

describe('TailwindKiller', () => {
  let tailwindKiller: TailwindKiller;
  let mockConfig: TailwindKillerConfig;

  beforeEach(() => {
    mockConfig = {
      orderMatters: false,
      scannedFileTypes: ['.astro', '.html', '.tsx'],
      maxLLMInvocations: 100,
      prefix: 'tw-',
      openaiApiUrl: 'https://api.openai.com/v1/engines/davinci-codex/completions',
      tailwindOptions: {},
      excludedDirectories: ['node_modules'],
      lockfilePath: 'tailwind-killer.lock',
      useLLM: true
    };

    tailwindKiller = new TailwindKiller(mockConfig);

    // Mock fs.readFileSync to return an empty JSON string
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({}));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('constructor initializes with correct config', () => {
    expect(tailwindKiller['orderMatters']).toBe(mockConfig.orderMatters);
    expect(tailwindKiller['scannedFileTypes']).toEqual(mockConfig.scannedFileTypes);
    expect(tailwindKiller['maxLLMInvocations']).toBe(mockConfig.maxLLMInvocations);
    expect(tailwindKiller['prefix']).toBe(mockConfig.prefix);
    expect(tailwindKiller['openaiApiUrl']).toBe(mockConfig.openaiApiUrl);
    expect(tailwindKiller['tailwindOptions']).toEqual(mockConfig.tailwindOptions);
    expect(tailwindKiller['excludedDirectories']).toEqual(mockConfig.excludedDirectories);
    expect(tailwindKiller['useLLM']).toBe(mockConfig.useLLM);
  });

  test('loadLockfile loads existing lockfile', () => {
    const mockLockfileContent = JSON.stringify({ 'file1.astro': { hash: 'abc123' } });
    (fs.readFileSync as jest.Mock).mockReturnValue(mockLockfileContent);

    tailwindKiller['loadLockfile']('mockLockfile.json');

    expect(tailwindKiller['lockfile']).toEqual(JSON.parse(mockLockfileContent));
  });

  test('loadLockfile creates empty lockfile if file does not exist', () => {
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('File not found');
    });

    tailwindKiller['loadLockfile']('nonexistent.json');

    expect(tailwindKiller['lockfile']).toEqual({});
  });

  test('saveLockfile writes lockfile to disk', () => {
    tailwindKiller['lockfile'] = { 'file1.astro': { hash: 'abc123' } };
    tailwindKiller['saveLockfile']('mockLockfile.json');

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'mockLockfile.json',
      JSON.stringify({ 'file1.astro': { hash: 'abc123' } }, null, 2)
    );
  });

  test('isFileModified returns true for new files', () => {
    const result = tailwindKiller['isFileModified']('newfile.astro', 'content');
    expect(result).toBe(true);
  });

  test('isFileModified returns false for unmodified files', () => {
    const content = 'file content';
    tailwindKiller['lockfile'] = {
      'file.astro': {
        hash: tailwindKiller['hashFn'](content),
        hashModified: tailwindKiller['hashFn'](content),
      }
    };

    const result = tailwindKiller['isFileModified']('file.astro', content);
    expect(result).toBe(false);
  });

  test('getClassName returns existing class name if available', async () => {
    tailwindKiller['tailwindClassnameMap'].set('bg-red-500', 'tw-red-background');
    const result = await tailwindKiller['getClassName']({ tag: 'div', class: 'bg-red-500' });
    expect(result).toBe('tw-red-background');
  });

  test('getClassName generates new class name if not available', async () => {
    const result = await tailwindKiller['getClassName']({ tag: 'div', class: 'bg-blue-500' });
    expect(result).toMatch(/^tw-/);
  });

  test('getCSSCode generates CSS for valid Tailwind classes', async () => {
    const result = await tailwindKiller['getCSSCode']({ tag: 'div', class: 'bg-blue-500' });
    expect(result).toContain('background-color:');
    expect(result).toContain('rgb(59,130,246)');
  });

  test('getCSSCode returns empty string for invalid Tailwind classes', async () => {
    const result = await tailwindKiller['getCSSCode']({ tag: 'div', class: 'invalid-class' });
    expect(result).toBe('');
  });

  test('replaceTailwind replaces Tailwind classes in file content', () => {
    tailwindKiller['tailwindClassnameMap'].set('bg-red-500', 'tw-red-background');
    tailwindKiller['classNamesToElementsMap'].set('bg-red-500', [
      { file: 'test.astro', indexClass: 12, lengthClass: 10, class: 'bg-red-500' }
    ]);

    const result = tailwindKiller['replaceTailwind']('<div class="bg-red-500">', 'test.astro');
    expect(result).toBe('<div class="tw-red-background">');
  });

  // test('run processes files and writes changes', async () => {
  //   const mockReaddir = fsPromises.readdir as jest.Mock; //TODO: is it a bad test or bad code?
  //   mockReaddir.mockResolvedValue(['file1.astro', 'file2.tsx']);

  //   const mockStat = fsPromises.stat as jest.Mock;
  //   mockStat.mockResolvedValue({ isDirectory: () => false, isFile: () => true });

  //   const mockReadFile = fsPromises.readFile as jest.Mock;
  //   mockReadFile.mockResolvedValue('<div class="bg-red-500">');

  //   // Mock isFileModified to return true for one file and false for the other
  //   tailwindKiller['isFileModified'] = jest.fn()
  //     .mockReturnValueOnce(true)   // First file is modified
  //     .mockReturnValueOnce(false); // Second file is not modified

  //   // Mock replaceTailwind to return modified content
  //   tailwindKiller['replaceTailwind'] = jest.fn().mockReturnValue('<div class="tw-red-background">');

  //   // Mock getCSSCode to return some CSS
  //   tailwindKiller['getCSSCode'] = jest.fn().mockResolvedValue('.tw-red-background { background-color: red; }');
    
  //   // Mock tailwindKiller.saveLockfile to observe if it's called
  //   const saveLockfileSpy = jest.spyOn(tailwindKiller, 'saveLockfile');

  //   // Spy on addToWrite method
  //   const addToWriteSpy = jest.spyOn(tailwindKiller, 'addToWrite');

  //   await tailwindKiller.run('src', 'tailwind-killer.lock');

  //   // Check if addToWrite was called for the modified file
  //   expect(addToWriteSpy).toHaveBeenCalledTimes(1);
  //   expect(addToWriteSpy).toHaveBeenCalledWith(
  //     expect.stringContaining('file1.astro'),
  //     expect.any(String)
  //   );

  //   // Check if saveLockfile was called
  //   expect(saveLockfileSpy).toHaveBeenCalledTimes(1);

  //   // Restore the original method
  //   addToWriteSpy.mockRestore();
  // });

  // Add this new test to check if files are skipped when not modified
  test('run skips unmodified files', async () => {
    const mockReaddir = fsPromises.readdir as jest.Mock;
    mockReaddir.mockResolvedValue(['file1.astro', 'file2.tsx']);

    const mockStat = fsPromises.stat as jest.Mock;
    mockStat.mockResolvedValue({ isDirectory: () => false, isFile: () => true });

    const mockReadFile = fsPromises.readFile as jest.Mock;
    mockReadFile.mockResolvedValue('<div class="bg-red-500">');

    // Mock isFileModified to return false
    tailwindKiller['isFileModified'] = jest.fn().mockReturnValue(false);

    await tailwindKiller.run('src', 'tailwind-killer.lock');

    expect(fsPromises.writeFile).not.toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith('tailwind-killer.lock', expect.any(String)); //TODO: we don't really care if we use writeFileSync or writeFile, but we need to spy on it
  });

  // describe('TailwindKiller Visual Regression Test', () => {
  //   let tailwindKiller: TailwindKiller;
  //   let mockConfig: TailwindKillerConfig;

  //   beforeEach(() => {
  //     mockConfig = {
  //       orderMatters: false,
  //       scannedFileTypes: ['.astro', '.html', '.tsx'],
  //       maxLLMInvocations: 100,
  //       prefix: 'tw-',
  //       openaiApiUrl: 'https://api.openai.com/v1/engines/davinci-codex/completions',
  //       tailwindOptions: {},
  //       excludedDirectories: ['node_modules'],
  //       lockfilePath: 'tailwind-killer.lock',
  //       useLLM: true
  //     };

  //     tailwindKiller = new TailwindKiller(mockConfig);
  //   });

  //   test('Visual regression test for de-Tailwinded page', async () => {
  //     const testHtmlPath = path.join(__dirname, '__tests__', 'test.html');
  //     const outputHtmlPath = path.join(__dirname, '__tests__', 'output.html');

  //     // Read the test HTML file
  //     const testHtml = await fs.promises.readFile(testHtmlPath, 'utf-8');

  //     // Process the HTML with TailwindKiller
  //     const processedHtml = tailwindKiller['replaceTailwind'](testHtml, testHtmlPath);

  //     // Write the processed HTML to a new file
  //     await fs.promises.writeFile(outputHtmlPath, processedHtml);

  //     // Launch a headless browser
  //     const browser = await puppeteer.launch();
  //     const page = await browser.newPage();

  //     // Function to capture screenshot
  //     async function captureScreenshot(filePath: string) {
  //       await page.goto(`file://${filePath}`);
  //       return await page.screenshot({ fullPage: true });
  //     }

  //     // Capture screenshots of both original and processed pages
  //     const originalScreenshot = await captureScreenshot(testHtmlPath);
  //     const processedScreenshot = await captureScreenshot(outputHtmlPath);

  //     // Close the browser
  //     await browser.close();

  //     // Compare screenshots
  //     const img1 = PNG.sync.read(originalScreenshot as Buffer);
  //     const img2 = PNG.sync.read(processedScreenshot as Buffer);
  //     const { width, height } = img1;
  //     const diff = new PNG({ width, height });

  //     const mismatchedPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold: 0.1 });

  //     // Assert that the number of mismatched pixels is below a threshold
  //     expect(mismatchedPixels).toBeLessThan(100); // Adjust this threshold as needed

  //     // Optionally, save diff image for visual inspection
  //     // fs.writeFileSync('diff.png', PNG.sync.write(diff));
  //   }, 30000); // Increase timeout for this test
  // });
});
