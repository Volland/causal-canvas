import * as vscode from 'vscode';
import { loadConfig, validate } from '@vpavlyshyn/core';
import { render } from '@vpavlyshyn/render';

/**
 * The figure preview.
 *
 * This shows the genuine emitter output rather than a second approximation of
 * it: the canvas and the figure are allowed to differ in styling, and the
 * preview is what closes that gap. It refuses to render a document with errors,
 * because the failure being avoided is shipping a figure that looks plausible
 * and is wrong.
 */
// @lat: [[extension#Causal Canvas extension#Figure Preview]]
export class FigurePreview {
  private panel?: vscode.WebviewPanel;
  private target?: vscode.Uri;
  private view?: string;

  async show(document: vscode.TextDocument, view?: string): Promise<void> {
    this.target = document.uri;
    this.view = view;

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'causalCanvas.preview',
        'Causal Figure Preview',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: false, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.target = undefined;
      });
    }
    await this.refresh(document);
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  async refresh(document: vscode.TextDocument): Promise<void> {
    if (!this.panel || this.target?.toString() !== document.uri.toString()) return;

    const config = loadConfig(document.uri.fsPath);
    const analysis = validate(document.getText(), { config });
    const errors = analysis.diagnostics.filter((d) => d.severity === 'error');

    if (!analysis.document || errors.length > 0) {
      this.panel.webview.html = this.message(
        'Cannot render',
        errors.length > 0
          ? errors
              .map(
                (error) => `<li><code>${escape(error.rule)}</code> ${escape(error.message)}</li>`,
              )
              .join('')
          : '<li>the document does not parse</li>',
      );
      return;
    }

    try {
      const result = await render(analysis.document, {
        ...(this.view ? { view: this.view } : {}),
        format: 'svg',
        themes: config.themes,
      });
      this.panel.title = `Preview — ${result.viewId}`;
      this.panel.webview.html = this.figure(result.content as string, result.viewId);
    } catch (cause) {
      this.panel.webview.html = this.message(
        'Cannot render',
        `<li>${escape(cause instanceof Error ? cause.message : String(cause))}</li>`,
      );
    }
  }

  private figure(svg: string, viewId: string): string {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { margin: 0; padding: 16px; background: var(--vscode-editor-background); }
  .caption { font: 12px var(--vscode-font-family); color: var(--vscode-descriptionForeground); margin-bottom: 10px; }
  .figure { background: #fff; padding: 12px; border-radius: 4px; overflow: auto; }
  svg { max-width: 100%; height: auto; }
</style></head>
<body><div class="caption">view <strong>${escape(viewId)}</strong> — this is the figure the render command produces</div>
<div class="figure">${svg}</div></body></html>`;
  }

  private message(title: string, items: string): string {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { margin: 0; padding: 16px; font: 13px var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  h2 { font-size: 13px; margin: 0 0 8px; }
  ul { margin: 0; padding-left: 18px; }
  li { margin-bottom: 4px; }
</style></head>
<body><h2>${escape(title)}</h2><ul>${items}</ul></body></html>`;
  }

  dispose(): void {
    this.panel?.dispose();
  }
}

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
