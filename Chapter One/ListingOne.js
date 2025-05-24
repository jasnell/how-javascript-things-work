// A puzzle
const { Worker, isMainThread, workerData, parentPort } =
    require('worker_threads');
const { fork } = require('child_process');
const { hash } = require('crypto');
const { EventEmitter } = require('events');

const i = Buffer.from([
  parseInt(hash('md5', 'a').slice(26, 28)) - 45]);

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
