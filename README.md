# how-javascript-things-work

Most books about programming languages are written to teach you how to use all
of the various features of the language, generally focusing on practical use
cases and best practices and how to achieve certain tasks. This book is not
that. This book is about how JavaScript works under the hood. The goal is to
give you a deeper understanding of the language and all of the various features
and APIs that build on top of the language so that you can use them more
effectively.

This book is not a tutorial, but rather a reference. Whether you are a newcomer
to JavaScript or a seasoned veteran, you should find something useful here.

We won't just cover the language itself but a range of standardized and
runtime-specific APIs that are built on top of the language that are common
to all JavaScript environments (and not just Web Browsers).

## Setting the Stage: Knowing what you do not know

A number of years ago, I was working as a consultant helping a large media
company figure out why their Node.js-based application was running so slowly.
I spent a couple of days digging through their code in detail and spotted a
range of issues that all boiled down to the team having a fundamental lack of
understanding of how things like Promises, streams, and event loop operated.
From that one consulting job I was able to put together enough material to create
a workshop that I ran for a number of years with different customers and at
conferences. I called it the "Broken Promises" workshop because the majority
of issues centered around the misuse and abuse of JavaScript Promises.

What that experience taught me is that there is a massive gap between knowing
what to use an API for and knowing how it actually works. More importantly, it
taught me that many developers don't take enough time to learn how the language
and APIs they are using work. This is a problem because, like the media company
I was working with, this lack of understanding can lead to very real performance
and scalability issues that can be very difficult to debug and fix.

Let's try to fill that gap here.

## A Brief Example

In the "Broken Promises" workshop I would often start with a code puzzle.

The puzzle was to look at a piece of gnarly looking code that uses various
asynchronous code scheduling mechanisms available in Node.js to print a message
to the console. Here, in listing 1, I've created a new variation of that
original puzzle. Your first exercise is to solve it without running the code at
all -- and no, I won't be giving you the answer.

```js
// Listing 1
const { Worker, isMainThread, workerData, parentPort } = require('worker_threads');
const { fork } = require('child_process');
const { hash } = require('crypto');
const { EventEmitter } = require('events');

const i = Buffer.from([parseInt(hash('md5', 'a').slice(26, 28)) - 45]);

process.on('uncaughtException', () => write('p'));

if (process.argv[2] === 'child') {
  write(i.toString());
  process.exit(0);
}

function child(resolver) {
  const proc = fork(__filename, ['child']);
  proc.on('close', resolver);
}

function write(c) {
  process.stdout.write(c);
}

if (isMainThread) {
  process.on('beforeExit', () => write('\n'));
  const ev = new EventEmitter();
  ev.on('event', () => {
    write('u');
    ev.emit('error', 'boom');
  });
  const workerData = new SharedArrayBuffer(4);
  const i32 = new Int32Array(workerData);
  const { promise, resolve } = Promise.withResolvers();
  let worker;

  async function next() {
    await promise;
    write(Buffer.from([105, 0x76]));
    queueMicrotask(() => write('e'));
    process.nextTick(() => write(i));
    worker.on('exit', () => {
      write('u');
      write(i);
      ev.emit('event');
    });
    worker.postMessage('y');
  }

  promise.then(() => write('g'));
  setImmediate(() => {
    write('r');
    process.nextTick(write.bind(null, 'g'));
    i32[0] = 1;
    setTimeout(() => write('on', 10));
    Atomics.wait(i32, 0, 1, 100);
    write(i);
    child(resolve);
    next();
  });
  queueMicrotask(() => write('e'));
  process.nextTick(() => write('n'));
  Promise.resolve().then(() => write('v'));
  setTimeout(() => write('e'), 1);
  worker = new Worker(__filename, { workerData });
  worker.on('message', (event) => {
    write(event);
    worker.terminate();
  });
} else {
  (async function () {
    parentPort.on('message', (data) => {
      write(data);
      parentPort.postMessage('o');
    });
    const i32 = new Int32Array(workerData);
    Atomics.wait(i32, 0, 0, 100);
    write('na');
  })();
}
```

Don't feel bad if you take one look at this example and suddenly start rethinking
the life choices that brought you here. Even a number of my fellow Node.js core
maintainers who have been using Node.js from nearly the beginning have had a
difficult time figuring this one out. In fact the entire point of this puzzle
is to demonstrate just how difficult it can be to understand and reason about
stuff that is happening in JavaScript.

Solving the puzzle without running the code requires knowing how things like
`process.nextTick()`, `queueMicrotask()`, promises. worker threads, streams,
Buffers, Unicode codepoints, `Atomics`, error handling, channel messaging,
and more not only work on their own but how they interact with one another.

Notice also that the puzzle includes mechanisms that are built directly into the
language (`Atomics` for instance) and mechanisms that are provided by the runtime.
Many developers often fail to understand the difference between those. Most
importantly, language-level features should always work the same way, while
there may be important differences in how runtime-level features are implemented.

To demonstrate by way of example, consider the code in Listing 2... which is a
much more simplified version of the puzzle in Listing 1.

```js
// Listing 2
function print(a) {
  process.stdout.write(a);
}

queueMicrotask(() => print('e'));
process.nextTick(() => print('H'));
setTimeout(() => print('l'), 0);
Promise.resolve().then(() => print('l'));
setImmediate(() => print('o\n'));
```

I won't torture you further by asking you to figure out what message this
simplified puzzle prints -- though you could likely guess fairly easily.
At the moment now when I'm writing this chapter, I am using Node.js v22.13.0
to put these examples together. Node.js will interpret this script, by default,
as CommonJS -- the original module system that Node.js has used since before
EcmaScript Modules (or ESM) was invented. When running Listing 2 in Node.js
the message it prints is a simple, friendly, "Hello".

But what if we ran this code as ESM in Node.js rather than CommonJS? Would the
result be the same? Those of you who have seen some of my conference talks will
already know the answer, but even the fact that I'm asking the question should
give you a hint. Somewhat surprisingly, the answer is definitely not.

```sh
// Note: Screenshot of Terminal Running Both Examples
$ node ListingTwo.cjs
Hello

$ node ListingTwo.mjs
elHo
```

So, one version of Node.js gives us two completely different answers. Let's
try the same script in some other runtimes. Let's try both Deno and Bun --
both alternative JavaScript runtimes that have actively pursued Node.js
compatibility. Will the result be the same? Let's find out.

First, let's try Deno.

```js
// Note: Screenshot of Terminal Running Listing Two
$ deno ListingTwo.js
elHerror: Uncaught (in promise) ReferenceError: setImmediate is not defined
setImmediate(() => print('o\n'));
^
    at file:///home/jsnell/projects/book/how-javascript-things-work/Chapter One/ListingTwo.js:9:1

    info: setImmediate is not available in the global scope in Deno.
    hint: Import it explicitly with import { setImmediate } from "node:timers";,
          or run again with --unstable-node-globals flag to add this global.
```

Oh my. Well, that's unfortunate. Deno does not support `setImmediate()` as a
global function. Why? Because Deno is not Node.js and `setImmediate()` is a
Node.js specific API. While Deno seeks to be compatible with Node.js it requires
a certain additional set of steps to be taken. In this case, we can simply
import `setImmediate()` from the `node:timers` module. Let's update our code
and try again.

```js
// Listing 3
import { setImmediate } from 'node:timers';

function print(a) {
  process.stdout.write(a);
}

queueMicrotask(() => print('e'));
process.nextTick(() => print('H'));
setTimeout(() => print('l'), 0);
Promise.resolve().then(() => print('l'));
setImmediate(() => print('o\n'));
```

Why import and not require as in the big puzzle in Listing 1? Well, we'll get
into the differences between ESM and CommonJS in a later chapter. For now it
is just important to note that Deno uses ESM as its module system by default,
so we're going to use ESM syntax here as well. Let's run this and see what
happens. If your guess is that it will print the same message as Node.js, you
are sadly mistaken.

```sh
// Note: Screenshot of Terminal Running Listing Three
$ deno ListingThree.js
elHlo
```

So, Deno gives us a different answer again. Let's try Bun.

```js
$ bun run ListingThree.js
Helo
```

Wait though... it is exactly the same code but we have four different results
from three different runtimes! Why are they so different -- and wrong?! This is
one of the many mysteries we will explore throughout the rest of this book.
I will, however, give you a hint. The answer is because there are subtle
differences in timing and order of operation between CommonJS and ESM; not to
mention the fact that each of the runtimes implements operations like `setTimeout()`,
`setImmediate()`, `queueMicrotask()`, and `process.nextTick()` in slightly
different ways. Not to mention the fact that Deno and Bun have completely
different implementations of their underlying event loops.

## How this book is organized

This book is organized into three parts.

The first part is about the JavaScript language itself. This includes coverage
of language features such as primitive data types, objects, inheritance, functions,
promises, async/await, and more. These chapters will cover the parts that really
should be the same across all runtimes. This is the part of the book that is
most similar to a traditional programming language reference book. Need to
know how strings and floating point numbers work? Or want to know what a
promise really is? This will be where you will find it.

The second part will cover a range of standard and runtime-specific APIs and
concepts that are built on top of the language and that are common to all
runtimes. This includes things like the event loop, streams, events, timers,
module loading, web assembly, and more.

The third and final part will cover a range of additional APIs and concepts
that don't really fit into the first two parts but are just as important to
understand. The spectrum of topics covered will be fairly broad but hopefully
it will be both interesting and useful.

## Colophon

...TODO
