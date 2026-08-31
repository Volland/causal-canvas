import * as vscode from 'vscode';
import { minimalEdit } from './diff.js';

/**
 * Apply new document text as the smallest edit that produces it, so one canvas
 * gesture is one tight undo step and open cursors do not jump.
 */
export async function applyText(document: vscode.TextDocument, next: string): Promise<boolean> {
  const change = minimalEdit(document.getText(), next);
  if (!change) return false;

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(document.positionAt(change.start), document.positionAt(change.end)),
    change.replacement,
  );
  return vscode.workspace.applyEdit(edit);
}
