'use strict';

const vscode = require('vscode');
const path   = require('path');
const fs     = require('fs');

// ─── Custom Editor Provider ──────────────────────────────────────────────────

class EventModelEditorProvider {

  static viewType = 'eventmodeler.editor';

  /** @type {Map<string, vscode.WebviewPanel>} uri → panel */
  _panels = new Map();

  /** @param {vscode.ExtensionContext} context */
  constructor(context) {
    this._ctx = context;
  }

  /**
   * VS Code calls this when the user opens a .eventmodel.json file.
   * @param {vscode.CustomDocument} document
   * @param {vscode.WebviewPanel} panel
   */
  async resolveCustomEditor(document, panel, _token) {
    const key = document.uri.toString();
    this._panels.set(key, panel);

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._ctx.extensionUri, 'media'),
      ],
    };

    panel.webview.html = this._buildHtml(panel.webview);

    // ── Messages: webview → extension ────────────────────────────────────────
    panel.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {

        // Webview finished loading; send the current file contents
        case 'ready': {
          const diagram = this._readFile(document.uri.fsPath);
          panel.webview.postMessage({ type: 'load', diagram });
          break;
        }

        // Webview reports a change; persist to disk
        case 'save': {
          const text = JSON.stringify(msg.diagram, null, 2);
          await this._writeFile(document.uri.fsPath, text);
          break;
        }

        // Webview wants to write an adjacent export file
        case 'exportFile': {
          const dir  = path.dirname(document.uri.fsPath);
          const stem = path.basename(document.uri.fsPath)
                           .replace(/\.eventmodel\.json$/, '')
                           .replace(/\.em\.json$/, '');
          const outPath = path.join(dir, `${stem}${msg.suffix}`);
          fs.writeFileSync(outPath, msg.content, 'utf8');
          const rel = vscode.workspace.asRelativePath(outPath);
          const choice = await vscode.window.showInformationMessage(
            `Exported → ${rel}`, 'Open'
          );
          if (choice === 'Open') {
            const doc = await vscode.workspace.openTextDocument(outPath);
            await vscode.window.showTextDocument(doc, { preview: false });
          }
          break;
        }

        case 'error':
          vscode.window.showErrorMessage(`EventModeler: ${msg.message}`);
          break;
      }
    });

    // Watch for external edits (git checkout, etc.)
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.file(path.dirname(document.uri.fsPath)),
        path.basename(document.uri.fsPath)
      )
    );
    watcher.onDidChange(() => {
      if (!panel.active) {
        const diagram = this._readFile(document.uri.fsPath);
        panel.webview.postMessage({ type: 'reload', diagram });
      }
    });
    panel.onDidDispose(() => {
      watcher.dispose();
      this._panels.delete(key);
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _readFile(fsPath) {
    try {
      const raw = fs.readFileSync(fsPath, 'utf8').trim();
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async _writeFile(fsPath, text) {
    try {
      fs.writeFileSync(fsPath, text, 'utf8');
    } catch (e) {
      vscode.window.showErrorMessage(`EventModeler: could not save — ${e.message}`);
    }
  }

  _buildHtml(webview) {
    const htmlPath = path.join(this._ctx.extensionPath, 'media', 'editor.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    // Inject CSP source so VS Code allows the webview's own scripts/styles
    html = html.replace(/\{\{cspSource\}\}/g, webview.cspSource);
    return html;
  }

  /** Called by export commands */
  triggerExport(format) {
    for (const panel of this._panels.values()) {
      if (panel.active) {
        panel.webview.postMessage({ type: 'requestExport', format });
        return true;
      }
    }
    return false;
  }
}

// ─── activate ────────────────────────────────────────────────────────────────

function activate(context) {
  const provider = new EventModelEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      EventModelEditorProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // New Diagram
  context.subscriptions.push(
    vscode.commands.registerCommand('eventmodeler.newDiagram', async (folderUri) => {
      // Determine target folder
      let folder;
      if (folderUri?.fsPath) {
        folder = fs.statSync(folderUri.fsPath).isDirectory()
          ? folderUri.fsPath
          : path.dirname(folderUri.fsPath);
      } else if (vscode.workspace.workspaceFolders?.length) {
        folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
      } else {
        vscode.window.showErrorMessage('Open a workspace folder first.');
        return;
      }

      const rawName = await vscode.window.showInputBox({
        prompt: 'Diagram name',
        value: 'my-event-model',
        validateInput: v => v.trim() ? null : 'Name is required',
      });
      if (!rawName) return;

      const slug  = rawName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
      const fpath = path.join(folder, `${slug}.eventmodel.json`);

      if (!fs.existsSync(fpath)) {
        const blank = {
          id: Date.now().toString(36),
          name: rawName.trim(),
          description: '',
          nodes: [],
          connections: [],
          version: '1.1.0',
          createdAt: new Date().toISOString(),
        };
        fs.writeFileSync(fpath, JSON.stringify(blank, null, 2), 'utf8');
      }

      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(fpath),
        EventModelEditorProvider.viewType
      );
    })
  );

  // Export commands — just forward to the active webview
  for (const [cmd, fmt] of [
    ['eventmodeler.exportAiContext', 'aiCtx'],
    ['eventmodeler.exportOpenAPI',  'openapi'],
    ['eventmodeler.exportTests',    'tests'],
    ['eventmodeler.exportMermaid',  'mermaid'],
    ['eventmodeler.exportFlow',     'flow'],
  ]) {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmd, () => {
        if (!provider.triggerExport(fmt)) {
          vscode.window.showWarningMessage('No active EventModeler diagram open.');
        }
      })
    );
  }
}

function deactivate() {}
module.exports = { activate, deactivate };
