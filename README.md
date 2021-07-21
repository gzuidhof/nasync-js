# nasync-js

> What if Javascript we could write asynchronous Javascript code as if it was synchronous like you would in Python or Golang?

This repo contains a transpiler for a flavor of Javascript called **n/async Javascript**. Its main demo is through a Starboard in-browser Notebook plugin which introduces the `nasync` cell type.


## Example

**Input (n/async Javascript)**

```javascript
const websiteText = fetch("https://enable-cors.org/").text();

console.log("Website text length", websiteText.length);

// All functions become async
function identity(a) {
  return a;
}

const hello = new Promise(x => setTimeout(_ => x("Hello"), 1000))
console.log("Some print message :)")

const stillHello = identity(hello);

// The last statement is the cell return value, unless it ends with a semicolon.
stillHello + " world"
```

**Transpiled code (vanilla JS)**

```javascript
(async () => {const websiteText = await (await (await fetch)("https://enable-cors.org/")).text();

  await (await console).log("Website text length", (await websiteText).length);

  // All functions become async
  async function identity(a) {
    return await a;
  }

  const hello = await new (await Promise)(await (async (x) => await (await setTimeout)(await (async (_) => await (await x)("Hello")), 1000)));
  await (await console).log("Some print message :)");

  const stillHello = await (await identity)(await hello);

  // The last statement is the cell return value, unless it ends with a semicolon.
  return { cellReturnValue: await ((await stillHello) + " world") };
})();
```

**Output**

```shell
Website text length 5716
Some print message :) 

// the cell return value
Promise<"Hello world"> 
```


## Questions

### Should I use this in production?
No. You could use it for playing around and quick experimentation in a notebook, but outside of that you should stick with writing `await` and `async` yourself. Sprinkling `await` everywhere in your code likely won't make it run any faster.

### Any caveats?
Member access expressions are not awaited (as this leads to `this` issues).
```javascript
// n/async javascript input
const x = myObject.a.b.c();

// Transpiled output
(async () => {const x = await (await myObject).a.b.c();
})();

// What you may expect
(async () => {const x = await (await (await (await (await myObject).a).b).c)();
})();
```
In practice this likely what you want, and if you do need to `await` member variables you can just write `await` yourself. I welcome a contribution which can demonstrate an edge case when this is needed (I couldn't come up with one).

## So what is this good for?
Use it in Starboard Notebook, load external data and play with your data as if there's no such thing as asynchronicity.

## License
[MIT](./LICENSE)
