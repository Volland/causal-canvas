import * as vscode from 'vscode';
import { isCausalDocument } from './diagnostics.js';

/**
 * Tracks which CausalJSON document a command should act on.
 *
 * `window.activeTextEditor` is undefined while a custom editor has focus, so
 * commands cannot rely on it alone. The custom editor reports its document
 * here, and text editors are picked up from the usual event.
 */
export class ActiveDocument {
  private current?: vscode.Uri;
  private readonly emitter = new vscode.EventEmitter<vscode.TextDocument | undefined>();
  readonly onDidChange = this.emitter.event;

  constructor() {
    this.adopt(vscode.window.activeTextEditor?.document);
  }

  track(): vscode.Disposable {
    return vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isCausalDocument(editor.document)) this.adopt(editor.document);
    });
  }

  adopt(document: vscode.TextDocument | undefined): void {
    if (!document || !isCausalDocument(document)) return;
    this.current = document.uri;
    void vscode.commands.executeCommand('setContext', 'causalCanvas.isCausalDocument', true);
    this.emitter.fire(document);
  }

  get(): vscode.TextDocument | undefined {
    const active = vscode.window.activeTextEditor?.document;
    if (active && isCausalDocument(active)) return active;
    if (!this.current) return undefined;
    return vscode.workspace.textDocuments.find(
      (candidate) => candidate.uri.toString() === this.current?.toString(),
    );
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
