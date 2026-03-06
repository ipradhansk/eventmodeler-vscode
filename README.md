# EventModeler — VS Code Extension

Visual [Event Storming](https://www.eventstorming.com/) / DDD canvas built into VS Code.  
Diagrams are plain **`.eventmodel.json`** files that live in your repo alongside your code.

---

## Features

| | |
|---|---|
| 🗂 **File-based** | Diagrams are JSON files — commit them with Git, diff them, review them in PRs |
| ✏️ **Full graphical canvas** | Drag, connect, resize, swimlanes, all node types |
| 💾 **Auto-save** | Every change is written to disk immediately (400 ms debounce) |
| 📤 **Export** | AI Context, OpenAPI YAML, BDD Test Cases, Mermaid, Event Flow — written as sibling files |
| 🔁 **External edits** | If you edit the JSON in a text editor, the canvas refreshes automatically |

---

## Getting Started

### Create a new diagram

1. Right-click a folder in the Explorer → **EventModeler: New Diagram**  
2. Or open the Command Palette (`Ctrl+Shift+P`) → **EventModeler: New Diagram**

This creates a `<name>.eventmodel.json` file and opens it in the canvas editor.

### Open an existing diagram

Double-click any `.eventmodel.json` or `.em.json` file — VS Code will open it in the EventModeler editor automatically.

To see the raw JSON, right-click the file → **Open With → Text Editor**.

---

## Node Types

| Node | Colour | Purpose |
|---|---|---|
| 🖥️ Trigger / UI | Grey | User interaction or external event that starts a flow |
| ⚡ Command | Blue | Intent to change state (imperative) |
| 📌 Event | Amber | Immutable fact, past tense |
| 📊 Read Model | Green | Projection built from events |
| ⚙️ Processor | Slate | Automated process |
| 🔌 API Endpoint | Teal | HTTP endpoint with method, path & response codes |
| 🧩 Microservice | Blue | Internal service |
| 🏗️ Software System | Purple | External system (add a logo from 20+ SaaS presets) |
| 〰️ Swimlane | — | Group nodes by actor / bounded context |
| 📝 Note | Yellow | Free-form annotation |
| ✨ Custom | Any | Define your own node type with any color & emoji |

---

## Export Commands

Run from the Command Palette while a diagram is open:

| Command | Output |
|---|---|
| **EventModeler: Export → AI Context** | `<name>-ai-context.md` — rich Markdown for LLM code generation |
| **EventModeler: Export → OpenAPI YAML** | `<name>-openapi.yaml` — skeleton from API Endpoint nodes |
| **EventModeler: Export → Test Cases** | `<name>-tests.md` — BDD test cards from business rules |
| **EventModeler: Export → Mermaid Diagram** | `<name>-mermaid.md` — flowchart for docs/wikis |
| **EventModeler: Export → Event Flow** | `<name>-event-flow.md` — narrative walkthrough |

Export buttons are also available directly in the diagram header bar.

---

## File Format

```jsonc
{
  "id": "abc123",
  "name": "Hotel Booking",
  "nodes": [
    {
      "id": "n1",
      "type": "command",          // trigger|command|event|readModel|processor|api|microservice|system|swimlane|note
      "x": 300, "y": 200,
      "w": 145,  "h": 80,
      "label": "BookRoom",
      "description": "Creates a reservation",
      "ownerTeams": ["Backend"],
      "contactPersons": ["Bob Kim"],
      "tags": ["booking"],
      "fields": [
        { "name": "roomId", "type": "uuid", "required": true }
      ],
      "businessRules": [
        { "description": "Room available", "given": "...", "when": "...", "then": "..." }
      ]
    }
  ],
  "connections": [
    {
      "id": "c1",
      "fromId": "n1", "fromSide": "r",
      "toId": "n2",   "toSide": "l",
      "connType": "produces",
      "lineStyle": "curve",
      "label": ""
    }
  ],
  "customTypes": [],   // persisted custom node type definitions
  "version": "1.1.0"
}
```

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `eventmodeler.autoSave` | `true` | Write changes to disk on every edit |

---

## Requirements

- VS Code 1.80+
- No external dependencies
