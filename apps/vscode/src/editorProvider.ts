import * as vscode from 'vscode';
import { loadConfig } from '@causal/core';
import {
  addRelation,
  addVariable,
  deleteRelation,
  deleteVariable,
  EditError,
  pinVariable,
  setVariableLabel,
  type EditResult,
} from '@causal/edits';
import type { RelationKind } from '@causal/spec';
import { parseIntent, type Intent, type Scene } from './protocol.js';
import { buildScene } from './scene.js';
import { applyText } from './textEdit.js';

const VIEW_TYPE = 'causalCanvas.editor';

/**
 * The custom text editor.
 *
 * The document being edited is the file's text, so undo, dirty state, save, and
 * version control all behave exactly as they do for any other file. The canvas
 * is a projection of that text and is never authoritative.
 */
// @lat: [[extension#Causal Canvas extension#Editor Architecture]]
export class CausalEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = VIEW_TYPE;

  /** Active view per open panel, so two panels on one file can differ. */
  private readonly activeView = new WeakMap<vscode.WebviewPanel, string>();
  /** Last scene that built successfully, kept so a mid-edit parse error does not blank the canvas. */
  private readonly lastGood = new Map<string, Scene>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      VIEW_TYPE,
      new CausalEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: true,
      },
    );
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    token: vscode.CancellationToken,
  ): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    };
    panel.webview.html = this.html(panel.webview);

    const push = async (): Promise<void> => {
      if (token.isCancellationRequested) return;
      const build = await buildScene(
        document.getText(),
        this.activeView.get(panel),
        loadConfig(document.uri.fsPath),
      );
      const key = document.uri.toString();

      if (build.scene) {
        this.lastGood.set(key, build.scene);
        await panel.webview.postMessage(build.scene);
        return;
      }
      // Keep showing the last good state rather than clearing the canvas while
      // the author is mid-keystroke in the text editor.
      const stale = this.lastGood.get(key);
      await panel.webview.postMessage(
        stale
          ? ({ ...stale, staleReason: build.problem } satisfies Scene)
          : ({
              type: 'scene',
              profile: 'dag',
              activeView: '',
              views: [],
              nodes: [],
              edges: [],
              theme: {
                background: '#ffffff',
                nodeFill: '#ffffff',
                nodeStroke: '#1f2933',
                nodeText: '#1f2933',
                edgeStroke: '#1f2933',
                fontFamily: 'sans-serif',
                fontSize: 13,
                highlightFill: '#fff3bf',
                highlightStroke: '#b8860b',
              },
              problems: [],
              staleReason: build.problem ?? 'document does not parse',
            } satisfies Scene),
      );
    };

    const subscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) void push();
    });

    panel.onDidDispose(() => {
      subscription.dispose();
      this.lastGood.delete(document.uri.toString());
    });

    panel.webview.onDidReceiveMessage(async (raw: unknown) => {
      const intent = parseIntent(raw);
      if (!intent) {
        console.error('Causal Canvas: ignoring malformed webview message', raw);
        return;
      }
      if (intent.type === 'ready') {
        await push();
        return;
      }
      if (intent.type === 'setActiveView') {
        this.activeView.set(panel, intent.viewId);
        await push();
        return;
      }
      await this.applyIntent(document, panel, intent);
    });

    await push();
  }

  private async applyIntent(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    intent: Exclude<Intent, { type: 'ready' } | { type: 'setActiveView' }>,
  ): Promise<void> {
    const text = document.getText();
    const viewId = this.activeView.get(panel);

    let result: EditResult;
    try {
      switch (intent.type) {
        case 'moveNode':
          result = pinVariable(text, {
            id: intent.id,
            x: intent.x,
            y: intent.y,
            ...(viewId ? { viewId } : {}),
          });
          break;
        case 'addRelation':
          result = addRelation(text, {
            from: intent.from,
            to: intent.to,
            kind: intent.kind as RelationKind,
          });
          break;
        case 'addVariable': {
          const added = addVariable(text, {
            id: intent.id,
            ...(intent.label ? { label: intent.label } : {}),
          });
          // Place it where the author dropped it, in the same gesture.
          const pinned = pinVariable(added.text, {
            id: intent.id,
            x: intent.x,
            y: intent.y,
            ...(viewId ? { viewId } : {}),
          });
          result = {
            text: pinned.text,
            changed: true,
            notes: [...added.notes, ...pinned.notes],
          };
          break;
        }
        case 'deleteVariable':
          result = deleteVariable(text, intent.id);
          break;
        case 'deleteRelation':
          result = deleteRelation(text, intent.id);
          break;
        case 'setLabel':
          result = setVariableLabel(text, intent.id, intent.label);
          break;
      }
    } catch (cause) {
      const message = cause instanceof EditError ? cause.message : String(cause);
      void vscode.window.showErrorMessage(`Causal Canvas: ${message}`);
      return;
    }

    if (!result.changed) return;
    await applyText(document, result.text);
    // Structural changes the author did not ask for are announced, never silent.
    for (const note of result.notes)
      void vscode.window.showInformationMessage(`Causal Canvas: ${note}`);
  }

  private html(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'canvas.js'),
    );
    const styles = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'canvas.css'),
    );
    const nonce = Array.from({ length: 32 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(
        Math.floor(Math.random() * 62),
      ),
    ).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${styles}" rel="stylesheet">
<title>Causal Canvas</title>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}
