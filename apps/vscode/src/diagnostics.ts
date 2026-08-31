import * as vscode from 'vscode';
import { lint, loadConfig, type Diagnostic as CausalDiagnostic } from '@causal-canvas/core';

export const isCausalDocument = (document: vscode.TextDocument): boolean =>
  document.uri.fsPath.endsWith('.causal.json');

function toRange(document: vscode.TextDocument, diagnostic: CausalDiagnostic): vscode.Range {
  const position = diagnostic.position;
  if (!position) return new vscode.Range(0, 0, 0, 1);
  // Core reports 1-based line and column; the editor is 0-based.
  const start = document.positionAt(position.offset);
  const end = document.positionAt(position.offset + Math.max(position.length, 1));
  return new vscode.Range(start, end);
}

/**
 * Publish diagnostics for open CausalJSON documents.
 *
 * Ranges come from the same JSON Pointer machinery the CLI uses, so the editor
 * and the terminal agree about where a problem is. Project configuration is
 * resolved per document, so a manuscript directory's publication gate reports
 * here exactly as it does in CI.
 */
// @lat: [[extension#Causal Canvas extension#Diagnostics]]
export class DiagnosticPublisher {
  private readonly collection = vscode.languages.createDiagnosticCollection('causal');
  private readonly pending = new Map<string, NodeJS.Timeout>();

  refresh(document: vscode.TextDocument, debounceMs = 200): void {
    if (!isCausalDocument(document)) return;
    const key = document.uri.toString();
    clearTimeout(this.pending.get(key));
    this.pending.set(
      key,
      setTimeout(() => {
        this.pending.delete(key);
        this.publish(document);
      }, debounceMs),
    );
  }

  private publish(document: vscode.TextDocument): void {
    let diagnostics: CausalDiagnostic[];
    try {
      diagnostics = lint(document.getText(), {
        config: loadConfig(document.uri.fsPath),
      }).diagnostics;
    } catch (cause) {
      this.collection.set(document.uri, [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 1),
          `Causal Canvas could not analyse this document: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
          vscode.DiagnosticSeverity.Warning,
        ),
      ]);
      return;
    }

    this.collection.set(
      document.uri,
      diagnostics.map((diagnostic) => {
        const entry = new vscode.Diagnostic(
          toRange(document, diagnostic),
          diagnostic.message,
          diagnostic.severity === 'error'
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning,
        );
        entry.source = 'causal';
        entry.code = diagnostic.rule;
        return entry;
      }),
    );
  }

  forget(document: vscode.TextDocument): void {
    clearTimeout(this.pending.get(document.uri.toString()));
    this.pending.delete(document.uri.toString());
    this.collection.delete(document.uri);
  }

  dispose(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.collection.dispose();
  }
}
