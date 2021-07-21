import {
  CellTypeDefinition,
  CellHandlerAttachParameters,
  CellElements,
  Cell,
  StarboardPlugin,
} from "starboard-notebook/dist/src/types";
import * as litImport from "lit";
import { Runtime, ControlButton } from "starboard-notebook/dist/src/types";
import { transpileToNasync } from "./transpiler";
import { evalNasync } from "./eval";

declare global {
  interface Window {
    runtime: Runtime;
    $_: any;
  }
}

export function registerNasync(runtime: Runtime) {
  /* These globals are exposed by Starboard Notebook. We can re-use them so we don't have to bundle them again. */
  const lit = runtime.exports.libraries.lit;

  const StarboardTextEditor = runtime.exports.elements.StarboardTextEditor;
  const ConsoleOutputElement = runtime.exports.elements.ConsoleOutputElement;
  const cellControlsTemplate = runtime.exports.templates.cellControls;
  const renderIfHtmlOutput = runtime.exports.core.renderIfHtmlOutput;

  const markdownIt = runtime.exports.libraries.MarkdownIt;

  const md = markdownIt();
  runtime.exports.core.hookMarkdownItToCodemirrorHighlighter(md);

  const NASYNC_CELL_TYPE_DEFINITION: CellTypeDefinition = {
    name: "n/async Javascript",
    cellType: ["nasync"],
    createHandler: (cell: Cell, runtime: Runtime) => new NasyncCellHandler(cell, runtime),
  };

  class NasyncCellHandler {
    private elements!: CellElements;
    private editor: any;

    private lastRunId = 0;
    private isCurrentlyRunning: boolean = false;

    private outputElement?: any;

    cell: Cell;
    runtime: Runtime;

    constructor(cell: Cell, runtime: Runtime) {
      this.cell = cell;
      this.runtime = runtime;
    }

    private getControls(): litImport.TemplateResult | string {
      const icon = this.isCurrentlyRunning ? "bi bi-hourglass" : "bi bi-play-circle";
      const tooltip = this.isCurrentlyRunning ? "Cell is running" : "Run Cell";
      const runButton: ControlButton = {
        icon,
        tooltip,
        //@ts-ignore
        callback: () => this.runtime.controls.runCell({ id: this.cell.id }),
      };
      let buttons = [runButton];

      return cellControlsTemplate({ buttons });
    }

    attach(params: CellHandlerAttachParameters): void {
      this.elements = params.elements;

      const topElement = this.elements.topElement;
      lit.render(this.getControls(), this.elements.topControlsElement);

      this.editor = new StarboardTextEditor(this.cell, this.runtime, { language: "javascript" });
      topElement.appendChild(this.editor);
    }

    async run() {
      const code = this.cell.textContent;

      this.lastRunId++;
      const currentRunId = this.lastRunId;
      this.isCurrentlyRunning = true;

      lit.render(this.getControls(), this.elements.topControlsElement);

      this.outputElement = new ConsoleOutputElement();
      this.outputElement.hook(this.runtime.consoleCatcher);

      const transpiledCodeElement = document.createElement("div");
      const htmlOutput = document.createElement("div");
      htmlOutput.classList.add("cell-output-html");
      lit.render(lit.html`${transpiledCodeElement}${this.outputElement}${htmlOutput}`, this.elements.bottomElement);

      try {
        const nasyncCode = transpileToNasync(code);

        const highlighted = md.render("```javascript\n" + nasyncCode + "\n```");
        const d = document.createElement("div");
        d.innerHTML = highlighted;

        lit.render(
          lit.html`<details style="font-size: 0.9em; line-height: 1.1; background-color: var(--code-background-color); border: 1px solid #eee; margin-bottom: 1em;"><summary style="margin-left: 1em">Show transpiled code</summary>${d}</details>`,
          transpiledCodeElement
        );

        const outVal = await evalNasync(nasyncCode);

        const val = outVal.value;
        const htmlOutputRendered = renderIfHtmlOutput(val, htmlOutput);

        if (!htmlOutputRendered && val !== undefined) {
          // Don't show undefined output
          if (outVal.error) {
            if (val.stack !== undefined) {
              let stackToPrint: string = val.stack;
              const errMsg: string = val.toString();
              if (stackToPrint.startsWith(errMsg)) {
                // Prevent duplicate error msg in Chrome
                stackToPrint = stackToPrint.substr(errMsg.length);
              }
              this.outputElement.addEntry({
                method: "error",
                data: [errMsg, stackToPrint],
              });
            } else {
              this.outputElement.addEntry({
                method: "error",
                data: [val],
              });
            }
          } else {
            this.outputElement.addEntry({
              method: "result",
              data: [val],
            });
          }
        }

        if (this.lastRunId === currentRunId) {
          this.isCurrentlyRunning = false;
          lit.render(this.getControls(), this.elements.topControlsElement);
        }

        if (outVal.error) {
          throw val;
        }
      } catch (e) {
        // Error in transpilation
        if (this.lastRunId === currentRunId) {
          this.isCurrentlyRunning = false;
          lit.render(this.getControls(), this.elements.topControlsElement);
        }

        if (e.stack !== undefined) {
          let stackToPrint: string = e.stack;
          const errMsg: string = e.toString();
          if (stackToPrint.startsWith(errMsg)) {
            // Prevent duplicate error msg in Chrome
            stackToPrint = stackToPrint.substr(errMsg.length);
          }
          this.outputElement.addEntry({
            method: "error",
            data: [errMsg, stackToPrint],
          });
        } else {
          this.outputElement.addEntry({
            method: "error",
            data: [e],
          });
        }
        // console.error(e);
        await this.outputElement.unhookAfterOneTick(this.runtime.consoleCatcher);
        throw e;
      }
    }

    focusEditor() {
      this.editor.focus();
    }

    async dispose() {
      this.editor.remove();
    }

    clear() {
      const html = lit.html;
      lit.render(html``, this.elements.bottomElement);
    }
  }

  runtime.definitions.cellTypes.register(NASYNC_CELL_TYPE_DEFINITION.cellType, NASYNC_CELL_TYPE_DEFINITION);
}

export const plugin: StarboardPlugin = {
  id: "nasync-javascript",
  metadata: {
    name: "n/async Javascript",
  },
  exports: {},
  async register(runtime: Runtime, opts: {}) {
    registerNasync(runtime);
  },
};
