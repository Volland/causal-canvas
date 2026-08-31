import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import * as vscode from 'vscode';
import { formatDocument, loadConfig, parseDocument, validate } from '@causal-canvas/core';
import { render, type OutputFormat } from '@causal-canvas/render';
import type { ProfileName } from '@causal-canvas/spec';
import type { ActiveDocument } from './active.js';
import { newModelDocument, PROFILE_CHOICES, withCausalExtension } from './scaffold.js';
import type { FigurePreview } from './preview.js';
import { applyText } from './textEdit.js';

const FORMATS: OutputFormat[] = ['svg', 'pdf', 'png'];

function settings() {
  return vscode.workspace.getConfiguration('causalCanvas');
}

async function requireDocument(active: ActiveDocument): Promise<vscode.TextDocument | undefined> {
  const document = active.get();
  if (!document) {
    void vscode.window.showWarningMessage('Causal Canvas: no CausalJSON document is active.');
    return undefined;
  }
  return document;
}

function outputDirectory(document: vscode.TextDocument): string {
  const configured = settings().get<string>('figureOutputDirectory') ?? '';
  if (!configured) return dirname(document.uri.fsPath);
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  return folder ? join(folder.uri.fsPath, configured) : configured;
}

// @lat: [[extension#Causal Canvas extension#Commands]]
export function registerCommands(
  context: vscode.ExtensionContext,
  active: ActiveDocument,
  preview: FigurePreview,
  chosenView: Map<string, string>,
): void {
  const register = (id: string, run: () => Promise<void> | void): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, run));
  };

  register('causalCanvas.newModel', async (target?: vscode.Uri) => {
    const picked = await vscode.window.showQuickPick(
      PROFILE_CHOICES.map((choice) => ({ label: choice.label, detail: choice.detail })),
      { placeHolder: 'Structural profile for the new model' },
    );
    if (!picked) return;
    const profile = picked.label as ProfileName;

    const name = await vscode.window.showInputBox({
      prompt: 'File name',
      value: 'model.causal.json',
      valueSelection: [0, 5],
      validateInput: (candidate) =>
        candidate.trim().length === 0 ? 'A file name is required' : undefined,
    });
    if (!name) return;

    // Invoked from the explorer we get a folder; otherwise fall back to the
    // workspace, and to a save dialog when there is no workspace at all.
    let directory: string | undefined;
    if (target) {
      try {
        const stat = await vscode.workspace.fs.stat(target);
        directory =
          stat.type === vscode.FileType.Directory ? target.fsPath : dirname(target.fsPath);
      } catch {
        directory = dirname(target.fsPath);
      }
    }
    directory ??= vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    let destination: vscode.Uri;
    if (directory) {
      destination = vscode.Uri.file(join(directory, withCausalExtension(name)));
    } else {
      const chosen = await vscode.window.showSaveDialog({
        saveLabel: 'Create model',
        filters: { 'Causal model': ['causal.json'] },
      });
      if (!chosen) return;
      destination = vscode.Uri.file(withCausalExtension(chosen.fsPath));
    }

    if (existsSync(destination.fsPath)) {
      void vscode.window.showErrorMessage(
        `Causal Canvas: ${basename(destination.fsPath)} already exists.`,
      );
      return;
    }

    try {
      mkdirSync(dirname(destination.fsPath), { recursive: true });
      writeFileSync(destination.fsPath, newModelDocument({ profile }), { flag: 'wx' });
    } catch (cause) {
      void vscode.window.showErrorMessage(
        `Causal Canvas: could not create the model — ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      return;
    }

    await vscode.commands.executeCommand('vscode.openWith', destination, 'causalCanvas.editor');
  });

  register('causalCanvas.render', async () => {
    const document = await requireDocument(active);
    if (!document) return;

    const config = loadConfig(document.uri.fsPath);
    const analysis = validate(document.getText(), { config });
    const errors = analysis.diagnostics.filter((d) => d.severity === 'error');
    if (!analysis.document || errors.length > 0) {
      void vscode.window.showErrorMessage(
        `Causal Canvas: cannot render, the document has ${errors.length || 1} error(s). See Problems.`,
      );
      return;
    }

    const configured = settings().get<OutputFormat>('figureFormat') ?? 'svg';
    const picked = await vscode.window.showQuickPick(FORMATS as string[], {
      placeHolder: `Figure format (configured default: ${configured})`,
    });
    const format: OutputFormat = FORMATS.includes(picked as OutputFormat)
      ? (picked as OutputFormat)
      : configured;

    const viewId = chosenView.get(document.uri.toString());
    try {
      const result = await render(analysis.document, {
        ...(viewId ? { view: viewId } : {}),
        format,
        themes: config.themes,
      });
      const directory = outputDirectory(document);
      mkdirSync(directory, { recursive: true });
      const name = `${basename(document.uri.fsPath).replace(/\.causal\.json$/, '')}-${result.viewId}.${format}`;
      const target = join(directory, name);
      writeFileSync(
        target,
        typeof result.content === 'string' ? result.content : Buffer.from(result.content),
      );
      const open = await vscode.window.showInformationMessage(
        `Causal Canvas: wrote ${name}`,
        'Reveal',
      );
      if (open) void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(target));
    } catch (cause) {
      void vscode.window.showErrorMessage(
        `Causal Canvas: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  });

  register('causalCanvas.format', async () => {
    const document = await requireDocument(active);
    if (!document) return;
    const parsed = parseDocument(document.getText());
    if (parsed.value === undefined) {
      void vscode.window.showErrorMessage(
        'Causal Canvas: cannot format, the document does not parse.',
      );
      return;
    }
    const changed = await applyText(document, formatDocument(parsed));
    if (!changed) void vscode.window.showInformationMessage('Causal Canvas: already formatted.');
  });

  register('causalCanvas.openPreview', async () => {
    const document = await requireDocument(active);
    if (!document) return;
    await preview.show(document, chosenView.get(document.uri.toString()));
  });

  register('causalCanvas.chooseView', async () => {
    const document = await requireDocument(active);
    if (!document) return;
    const analysis = validate(document.getText());
    const views = analysis.document?.views ?? [];
    if (views.length === 0) {
      void vscode.window.showInformationMessage(
        'Causal Canvas: this document declares no views, so the whole model is shown.',
      );
      return;
    }
    const picked = await vscode.window.showQuickPick(
      views.map((view) => ({ label: view.id, description: view.title ?? '' })),
      { placeHolder: 'Active view for rendering and preview' },
    );
    if (!picked) return;
    chosenView.set(document.uri.toString(), picked.label);
    await preview.refresh(document);
  });

  register('causalCanvas.openInTextEditor', async () => {
    const document = await requireDocument(active);
    if (!document) return;
    await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default', {
      viewColumn: vscode.ViewColumn.Beside,
    });
  });
}
