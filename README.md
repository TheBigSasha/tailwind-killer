# Tailwind Killer

Tailwind Killer is a powerful CLI tool designed to remove Tailwind CSS from your project and migrate to regular CSS. It automates the process of converting Tailwind classes to standard CSS, making it easier to transition away from Tailwind or to refactor your existing codebase.

## Features

- Converts Tailwind CSS classes to regular CSS
- Supports multiple file types (Astro, TSX, JSX, Vue, HTML)
- Configurable options for fine-tuned control
- Uses a lockfile to track changes and avoid unnecessary processing
- Optional LLM (Language Model) integration for intelligent class name generation

## Installation

To install Tailwind Killer, build from source. The library will be published to NPM later, and this section will be updated.
```bash
pnpm i -g tailwind-killer
```
or
```bash
npm i -g tailwind-killer
```

## Usage

To use Tailwind Killer, run the following command in your project directory:

```bash
tailwind-killer [options]
```

## How It Works

1. Tailwind Killer scans your project directory for files matching the specified types.
2. It identifies Tailwind classes in these files.
3. For each unique set of Tailwind classes, it generates a new CSS class name.
4. It replaces the Tailwind classes in your files with the newly generated class names.
5. It creates CSS files with the converted styles.
6. A lockfile is used to track changes and optimize subsequent runs.

## LLM Integration

When `useLLM` is set to `true`, Tailwind Killer uses a Language Model to generate meaningful class names based on the Tailwind classes. This can result in more readable and maintainable CSS. The `openaiApiUrl` option specifies the endpoint for the LLM service.

## Lockfile

The lockfile (default: `tailwind-killer-lockfile.json`) keeps track of processed files and their hash values. This ensures that only modified files are processed in subsequent runs, improving performance.

## Configuration Options Explained

- `rootDir`: The starting point for file scanning. Set this to target a specific directory in your project.
- `lockfilePath`: Location of the lockfile. Customize this if you want to store the lockfile in a different location.
- `orderMatters`: Set to `true` if the order of Tailwind classes is significant in your project.
- `scannedFileTypes`: Add or remove file extensions to control which files are processed.
- `maxLLMInvocations`: Limits the number of times the LLM is called, useful for controlling API usage.
- `prefix`: Customize the prefix for generated class names to avoid conflicts with existing classes.
- `openaiApiUrl`: Set this to your OpenAI API endpoint or a compatible service.
- `excludedDirectories`: Add directories you want to skip during processing.
- `useLLM`: Disable this if you prefer not to use LLM for class name generation.

## Best Practices

- Always backup your project before running Tailwind Killer.
- Start with a small subset of files to test the output before processing your entire project.
- Review the generated CSS and class names to ensure they meet your project's naming conventions.
- Use version control to easily track and manage changes made by Tailwind Killer.
- Adjust the `maxLLMInvocations` based on your API usage limits and project size.
- Customize the `prefix` to align with your project's naming conventions.
- Regularly update your `excludedDirectories` list as your project structure evolves.

## Contributing

Contributions to Tailwind Killer are welcome! Please refer to the [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines on how to contribute to this project.

## License

Tailwind Killer is released under the MIT License. See the [LICENSE](LICENSE) file for more details.

## Support

If you encounter any issues or have questions, please file an issue on the [GitHub repository](https://github.com/yourusername/tailwind-killer/issues).
