import * as vscode from 'vscode';
import { ActiveDocument } from './active.js';
import { registerCommands } from './commands.js';
import { DiagnosticPublisher, isCausalDocument } from './diagnostics.js';
import { CausalEditorProvider } from './editorProvider.js';
import { FigurePreview } from './preview.js';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new DiagnosticPublisher();
  const preview = new FigurePreview();
  const active = new ActiveDocument();
  /** Active view per document, for the render command and the preview. */
  const chosenView = new Map<string, string>();

  context.subscriptions.push(
    diagnostics,
    preview,
    active,
    active.track(),
    CausalEditorProvider.register(context),

    vscode.workspace.onDidOpenTextDocument((document) => {
      if (!isCausalDocument(document)) return;
      active.adopt(document);
      diagnostics.refresh(document, 0);
      if (vscode.workspace.getConfiguration('causalCanvas').get<boolean>('preview.autoOpen')) {
        void preview.show(document);
      }
    }),

    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!isCausalDocument(event.document)) return;
      diagnostics.refresh(event.document);
      void preview.refresh(event.document);
    }),

    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnostics.forget(document);
      chosenView.delete(document.uri.toString());
    }),
  );

  registerCommands(context, active, preview, chosenView);

  for (const document of vscode.workspace.textDocuments) {
    if (isCausalDocument(document)) diagnostics.refresh(document, 0);
  }
}

export function deactivate(): void {
  // Everything is registered through context.subscriptions.
}
