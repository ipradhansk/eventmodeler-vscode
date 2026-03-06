'use strict';

// Written in ES5-compatible style to avoid any class-field or syntax issues
// with VS Code's bundled Node.js version.

const vscode = require('vscode');
const path   = require('path');
const fs     = require('fs');

// ─── Provider constructor ────────────────────────────────────────────────────

function EventModelEditorProvider(context) {
  this._ctx    = context;
  this._panels = new Map(); // uri.toString() → WebviewPanel
}

EventModelEditorProvider.VIEW_TYPE = 'eventmodeler.editor';

// VS Code calls this for every .eventmodel.json that gets opened.
// We implement CustomTextEditorProvider (resolveCustomTextEditor).
EventModelEditorProvider.prototype.resolveCustomTextEditor = function(document, panel, _token) {
  var self = this;

  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: [
      vscode.Uri.joinPath(self._ctx.extensionUri, 'media'),
    ],
  };

  try {
    panel.webview.html = self._buildHtml(panel.webview);
  } catch (err) {
    vscode.window.showErrorMessage('EventModeler: could not load editor — ' + err.message);
    return;
  }

  var key = document.uri.toString();
  self._panels.set(key, panel);

  // Messages from webview → extension
  panel.webview.onDidReceiveMessage(function(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'ready': {
        var diagram = self._parse(document.getText());
        panel.webview.postMessage({ type: 'load', diagram: diagram });
        break;
      }
      case 'save': {
        self._writeBack(document, msg.diagram);
        break;
      }
      case 'exportFile': {
        var dir     = path.dirname(document.uri.fsPath);
        var stem    = path.basename(document.uri.fsPath)
                         .replace(/\.eventmodel\.json$/, '')
                         .replace(/\.em\.json$/, '');
        var outPath = path.join(dir, stem + msg.suffix);
        try {
          fs.writeFileSync(outPath, msg.content, 'utf8');
          var rel = vscode.workspace.asRelativePath(outPath);
          vscode.window.showInformationMessage('Exported → ' + rel, 'Open').then(function(c) {
            if (c === 'Open') {
              vscode.workspace.openTextDocument(outPath).then(function(d) {
                vscode.window.showTextDocument(d, { preview: false });
              });
            }
          });
        } catch (e) {
          vscode.window.showErrorMessage('EventModeler: export failed — ' + e.message);
        }
        break;
      }
      case 'error': {
        vscode.window.showErrorMessage('EventModeler: ' + msg.message);
        break;
      }
    }
  });

  // Reload when external tool (git, text editor) changes the file
  var docChange = vscode.workspace.onDidChangeTextDocument(function(e) {
    if (e.document.uri.toString() === key && !panel.active) {
      panel.webview.postMessage({ type: 'reload', diagram: self._parse(e.document.getText()) });
    }
  });

  panel.onDidDispose(function() {
    docChange.dispose();
    self._panels.delete(key);
  });
};

EventModelEditorProvider.prototype._parse = function(text) {
  try {
    var t = (text || '').trim();
    return t ? JSON.parse(t) : null;
  } catch (e) {
    return null;
  }
};

EventModelEditorProvider.prototype._writeBack = function(document, diagram) {
  var text = JSON.stringify(diagram, null, 2);
  var edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    ),
    text
  );
  vscode.workspace.applyEdit(edit);
};

EventModelEditorProvider.prototype._buildHtml = function(webview) {
  var htmlPath = path.join(this._ctx.extensionPath, 'media', 'editor.html');
  var html = fs.readFileSync(htmlPath, 'utf8');
  // Replace the {{cspSource}} placeholder — use split/join to avoid regex issues
  html = html.split('{{cspSource}}').join(webview.cspSource);
  return html;
};

EventModelEditorProvider.prototype.triggerExport = function(format) {
  this._panels.forEach(function(panel) {
    if (panel.active) {
      panel.webview.postMessage({ type: 'requestExport', format: format });
    }
  });
};

// ─── activate / deactivate ───────────────────────────────────────────────────

function activate(context) {
  var provider = new EventModelEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      EventModelEditorProvider.VIEW_TYPE,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  // New Diagram
  context.subscriptions.push(
    vscode.commands.registerCommand('eventmodeler.newDiagram', function(folderUri) {
      var folder = null;

      if (folderUri && folderUri.fsPath) {
        try {
          folder = fs.statSync(folderUri.fsPath).isDirectory()
            ? folderUri.fsPath
            : path.dirname(folderUri.fsPath);
        } catch (e) {}
      }

      if (!folder) {
        var wf = vscode.workspace.workspaceFolders;
        if (wf && wf.length > 0) folder = wf[0].uri.fsPath;
      }

      if (!folder) {
        vscode.window.showErrorMessage('EventModeler: open a workspace folder first.');
        return;
      }

      vscode.window.showInputBox({
        prompt: 'Diagram name',
        value: 'my-event-model',
        validateInput: function(v) { return (v && v.trim()) ? null : 'Name is required'; },
      }).then(function(rawName) {
        if (!rawName) return;
        var slug  = rawName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
        var fpath = path.join(folder, slug + '.eventmodel.json');

        if (!fs.existsSync(fpath)) {
          var blank = {
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

        vscode.commands.executeCommand(
          'vscode.openWith',
          vscode.Uri.file(fpath),
          EventModelEditorProvider.VIEW_TYPE
        );
      });
    })
  );

  // Export commands
  [
    ['eventmodeler.exportAiContext', 'aiCtx'],
    ['eventmodeler.exportOpenAPI',   'openapi'],
    ['eventmodeler.exportTests',     'tests'],
    ['eventmodeler.exportMermaid',   'mermaid'],
    ['eventmodeler.exportFlow',      'flow'],
  ].forEach(function(pair) {
    context.subscriptions.push(
      vscode.commands.registerCommand(pair[0], function() {
        provider.triggerExport(pair[1]);
      })
    );
  });
}

function deactivate() {}
module.exports = { activate: activate, deactivate: deactivate };
