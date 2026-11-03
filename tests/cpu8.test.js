const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const EW = require("../web/cpu8.js");

const root = path.join(__dirname, "..");
const py = (process.env.PYTHON || "python3");

test("JS demo machine outputs HOST OUTPUT [44, 246, 15, 42, 91]", () => {
  assert.deepStrictEqual(new EW.Machine().run(), [44, 246, 15, 42, 91]);
});

test("JS trace matches Python main.py trace line for line", () => {
  const pyOut = execFileSync(py, ["main.py"], { cwd: root, encoding: "utf8" })
    .split("\n").filter((l) => l.startsWith("[r"));
  const js = []; new EW.Machine().run((l) => js.push(l));
  assert.deepStrictEqual(js, pyOut);
});

test("JS assembled programs are byte-identical to Python", () => {
  const code = "import json,main;print(json.dumps({'p':main.PROGRAMS,'h':main.HOST}))";
  const ref = JSON.parse(execFileSync(py, ["-c", code], { cwd: root, encoding: "utf8" }));
  for (const k of [1, 2, 3, 4]) assert.deepStrictEqual(EW.PROGRAMS[k], ref.p[k]);
  assert.deepStrictEqual(EW.HOST, ref.h);
});

test("text assembler: labels, hex and data pokes", () => {
  const { program, data } = EW.assembleText("start: LDI 200\nADD 0x80 ; x\nJZ start\nSEND\nHALT\n@0x80 100");
  assert.deepStrictEqual(program, [2, 200, 4, 0x80, 7, 0, 9, 0, 0, 0]);
  assert.deepStrictEqual(data, { 128: 100 });
  const vm = new EW.VM(1, program, data); vm.cpu.run();
  assert.deepStrictEqual(vm.link.toHost, [44]);
});
