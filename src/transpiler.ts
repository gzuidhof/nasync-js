// import { parse } from "@babel/parser";
// import generate from "@babel/generator";

import type { types } from "@babel/core";
import { registerPlugin, transform } from "@babel/standalone";
import { TraverseOptions } from "@babel/traverse";

function nasyncify(babel: any): { visitor: TraverseOptions<Node> } {
  const t: typeof types = babel.types;

  let firstBlockStatement: types.BlockStatement | undefined = undefined;
  let lastHasBeenReplaced = false;

  function isLastStatementInProgram(node: types.Node) {
    if (!firstBlockStatement) return;
    return firstBlockStatement.body[firstBlockStatement?.body.length - 1] === node;
  }

  return {
    visitor: {
      CallExpression(path) {
        if (!path.state) {
          if (path.node.start === 0) {
            // Ugly hack to reset the state
            firstBlockStatement = undefined;
            lastHasBeenReplaced = false;
            path.state = true;
          }
        }
      },
      BlockStatement(path) {
        if (firstBlockStatement === undefined) {
          firstBlockStatement = path.node;
        }
      },
      Expression(path) {
        if (
          !lastHasBeenReplaced &&
          // The last statement in the original program should be the return value
          isLastStatementInProgram(path.parent) &&
          (path.isAwaitExpression() || path.isLiteral())
        ) {
          if (path.isAwaitExpression() && (path.container as any).end > path.node.argument.end!) {
            // A semicolon is present, cell should not have a return value.
          } else if (path.isLiteral() && (path.container as any).end > (path.container as any).expression.end) {
            // A semicolon is present after this literal, the cell should not have a return value.
          } else {
            const orgLoc = JSON.parse(JSON.stringify(path.parent.loc)); // Poor man's copy
            const replacement = path.parentPath.replaceWith(
              t.returnStatement(
                t.objectExpression([t.objectProperty(t.identifier("cellReturnValue"), path.node)]) /*]))*/
              )
            );
            // Necessary to keep the new "return" statement on the same line as the original expression.
            replacement[0].node.loc = orgLoc;
            lastHasBeenReplaced = true;
            return;
          }
        }

        // We don't want to await the return statement.
        if (isLastStatementInProgram(path.parent) && path.parentPath.isReturnStatement()) return;

        if (
          (path.node.start !== null && path.node.start < 2) || // The async wrap that enables top-level await shouldnt be awaited
          path.isAwaitExpression() ||
          path.isLiteral() ||
          path.isMemberExpression() ||
          t.isAwaitExpression(path.parent) ||
          t.isAssignmentExpression(path.parent)
        ) {
          return;
        }
        path.replaceWith(t.awaitExpression(path.node));
      },
      Function(path) {
        path.node.async = true;
      },
    },
  };
}

registerPlugin("nasyncify", nasyncify);

export function transpileToNasync(code: string) {
  // Trick for object literals
  if (/^\s*\{/.test(code) && /\}\s*$/.test(code)) {
    code = `(${code})`;
  }

  let wrapped = "(async () => {" + code + "\n})()";

  const res = transform(wrapped, {
    plugins: ["nasyncify"],
    retainLines: true,
    ast: true,
  });
  let nasyncCode = res.code!;
  return nasyncCode;
}
