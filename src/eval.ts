interface RunResult {
  error: boolean;
  code: string;
  value?: any;
}

/**
 * Checks the state of a promise more or less 'right now'.
 * @param p
 */
export function promiseState(p: Promise<any>): Promise<"pending" | "fulfilled" | "rejected"> {
  const t = {};
  return Promise.race([p, t]).then(
    (v) => (v === t ? "pending" : "fulfilled"),
    () => "rejected"
  );
}

export async function evalNasync(nasyncCode: string): Promise<RunResult> {
  const res: RunResult = {
    error: false,
    code: nasyncCode,
  };

  try {
    const cellResult = await window.eval(nasyncCode);
    if (cellResult === undefined) {
      res.value = undefined;
      window["$_"] = res.value;
      return res;
    }

    const state = await promiseState(cellResult.returnValue);
    if (state === "fulfilled") {
      // Result is either a promise that was awaited, or an not a promise.
      res.value = await cellResult.cellReturnValue;
    } else {
      // Result is a promise that was not awaited, "finish" the cell.
      res.value = cellResult.cellReturnValue;
    }
    window["$_"] = res.value;

    return res;
  } catch (error) {
    res.error = true;
    res.value = error;
    return res;
  }
}
