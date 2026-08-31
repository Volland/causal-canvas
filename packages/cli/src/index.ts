import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  fix as applyFixes,
  formatDocument,
  lint,
  loadConfig,
  parseDocument,
  summarize as summarizeModel,
  validate,
  type Diagnostic,
} from '@causal/core';
import { render, UnknownThemeError, UnknownViewError, type OutputFormat } from '@causal/render';
import { toJson, toText, summarize, type FileResult } from './report.js';

export const VERSION = '0.1.0';

const USAGE = `causal — CausalJSON toolchain (v${VERSION})

Usage:
  causal validate <file...>   [--json] [--warnings-as-errors]
  causal lint     <file...>   [--json] [--fix] [--warnings-as-errors]
  causal fmt      <file...>   [--write] [--check]
  causal render   <file>      [--view <id>] [--all] [--format svg|pdf|png]
                              [--out <path>] [--width <px>] [--scale <n>]
  causal summarize <file>     [--no-annotations]

Options:
  --json                 structured output on stdout
  --fix                  repair mechanical problems in place
  --warnings-as-errors   exit non-zero when only warnings were found
  --version, --help

Exit codes:
  0  no error-severity diagnostics
  1  at least one error-severity diagnostic
  2  the command itself could not run
`;

class UsageError extends Error {}

interface Io {
  out(text: string): void;
  err(text: string): void;
}

function readFiles(paths: string[]): { file: string; text: string }[] {
  if (paths.length === 0) throw new UsageError('no input files');
  return paths.map((file) => ({ file, text: readFileSync(file, 'utf8') }));
}

function exitCode(results: FileResult[], warningsAsErrors: boolean): number {
  const { errors, warnings } = summarize(results);
  if (errors > 0) return 1;
  if (warningsAsErrors && warnings > 0) return 1;
  return 0;
}

function emit(io: Io, results: FileResult[], json: boolean): void {
  io.out(json ? toJson(results) : toText(results));
}

function checkCommand(
  paths: string[],
  json: boolean,
  warningsAsErrors: boolean,
  io: Io,
  run: (text: string, file: string) => Diagnostic[],
): number {
  const results: FileResult[] = readFiles(paths).map(({ file, text }) => ({
    file,
    diagnostics: run(text, file),
  }));
  emit(io, results, json);
  return exitCode(results, warningsAsErrors);
}

function outputPath(
  out: string | undefined,
  documentPath: string,
  viewId: string,
  format: OutputFormat,
): string {
  const name = `${basename(documentPath).replace(/\.causal\.json$/, '')}-${viewId}.${format}`;
  if (!out) return join(dirname(documentPath), name);
  const isDirectory = out.endsWith('/') || (existsDirectory(out) ?? false);
  return isDirectory ? join(out, name) : out;
}

function existsDirectory(path: string): boolean | undefined {
  try {
    return statSync(path).isDirectory();
  } catch {
    return undefined;
  }
}

async function renderCommand(
  positionals: string[],
  values: Record<string, unknown>,
  io: Io,
): Promise<number> {
  const documentPath = positionals[0];
  if (!documentPath) throw new UsageError('render needs exactly one document');

  const text = readFileSync(documentPath, 'utf8');
  const config = loadConfig(resolve(documentPath));
  const result = validate(text, { config });
  if (!result.document || result.diagnostics.some((d) => d.severity === 'error')) {
    emit(io, [{ file: documentPath, diagnostics: result.diagnostics }], Boolean(values['json']));
    io.err('render aborted: the document has errors\n');
    return 1;
  }

  const format = (values['format'] as OutputFormat | undefined) ?? 'svg';
  if (!['svg', 'pdf', 'png'].includes(format)) {
    throw new UsageError(`unknown format \`${format}\`; expected svg, pdf, or png`);
  }

  const views = values['all']
    ? result.document.views.map((view) => view.id)
    : [values['view'] as string | undefined];
  if (views.length === 0) views.push(undefined);

  const written: string[] = [];
  for (const view of views) {
    const rendered = await render(result.document, {
      view,
      format,
      themes: config.themes,
      png: {
        ...(values['width'] ? { width: Number(values['width']) } : {}),
        ...(values['scale'] ? { scale: Number(values['scale']) } : {}),
      },
    });
    const target =
      views.length > 1 || values['all']
        ? outputPath(values['out'] as string | undefined, documentPath, rendered.viewId, format)
        : outputPath(values['out'] as string | undefined, documentPath, rendered.viewId, format);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      typeof rendered.content === 'string' ? rendered.content : Buffer.from(rendered.content),
    );
    written.push(target);
  }

  io.err(`wrote ${written.join(', ')}\n`);
  return 0;
}

function fmtCommand(paths: string[], values: Record<string, unknown>, io: Io): number {
  const check = Boolean(values['check']);
  const write = Boolean(values['write']);
  let changed = 0;

  for (const { file, text } of readFiles(paths)) {
    const parsed = parseDocument(text);
    if (parsed.value === undefined) {
      emit(io, [{ file, diagnostics: parsed.diagnostics }], Boolean(values['json']));
      return 1;
    }
    const formatted = formatDocument(parsed);
    if (formatted === text) continue;
    changed++;
    if (check) {
      io.err(`${file} is not formatted\n`);
    } else if (write) {
      writeFileSync(file, formatted);
      io.err(`formatted ${file}\n`);
    } else {
      io.out(formatted);
    }
  }

  return check && changed > 0 ? 1 : 0;
}

// @lat: [[cli#Command Line#Commands]]
export async function run(argv: string[], io: Io): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        json: { type: 'boolean', default: false },
        fix: { type: 'boolean', default: false },
        'warnings-as-errors': { type: 'boolean', default: false },
        write: { type: 'boolean', default: false },
        check: { type: 'boolean', default: false },
        all: { type: 'boolean', default: false },
        annotations: { type: 'boolean', default: true },
        view: { type: 'string' },
        format: { type: 'string' },
        out: { type: 'string' },
        width: { type: 'string' },
        scale: { type: 'string' },
        version: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    });
  } catch (cause) {
    io.err(`${cause instanceof Error ? cause.message : String(cause)}\n\n${USAGE}`);
    return 2;
  }

  const { values, positionals } = parsed;
  if (values.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    io.out(USAGE);
    return command ? 0 : 2;
  }

  const json = Boolean(values.json);
  const warningsAsErrors = Boolean(values['warnings-as-errors']);

  try {
    switch (command) {
      case 'validate':
        return checkCommand(
          rest,
          json,
          warningsAsErrors,
          io,
          (text, file) => validate(text, { config: loadConfig(resolve(file)) }).diagnostics,
        );

      case 'lint': {
        if (values.fix) {
          const results: FileResult[] = [];
          for (const { file, text } of readFiles(rest)) {
            const config = loadConfig(resolve(file));
            const fixed = applyFixes(text, { config });
            if (fixed.text !== text) {
              writeFileSync(file, fixed.text);
              io.err(`fixed ${fixed.applied.length} problem(s) in ${file}\n`);
            }
            results.push({ file, diagnostics: fixed.remaining });
          }
          emit(io, results, json);
          return exitCode(results, warningsAsErrors);
        }
        return checkCommand(
          rest,
          json,
          warningsAsErrors,
          io,
          (text, file) => lint(text, { config: loadConfig(resolve(file)) }).diagnostics,
        );
      }

      case 'fmt':
        return fmtCommand(rest, values as Record<string, unknown>, io);

      case 'render':
        return await renderCommand(rest, values as Record<string, unknown>, io);

      case 'summarize': {
        const file = rest[0];
        if (!file) throw new UsageError('summarize needs exactly one document');
        const text = readFileSync(file, 'utf8');
        const result = validate(text, { config: loadConfig(resolve(file)) });
        if (!result.document) {
          emit(io, [{ file, diagnostics: result.diagnostics }], json);
          return 1;
        }
        io.out(summarizeModel(result.document, { annotations: values.annotations !== false }));
        return 0;
      }

      default:
        io.err(`unknown command \`${command}\`\n\n${USAGE}`);
        return 2;
    }
  } catch (cause) {
    if (cause instanceof UsageError) {
      io.err(`${cause.message}\n\n${USAGE}`);
      return 2;
    }
    if (cause instanceof UnknownViewError || cause instanceof UnknownThemeError) {
      io.err(`${cause.message}\n`);
      return 2;
    }
    io.err(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    return 2;
  }
}

export { toJson, toText } from './report.js';
