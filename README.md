# Earthenware Computer

A ternary-style tree: **5 beginnings, 9 next steps, 15 blocks** (29 nodes). The first beginning's subtree is a real 8-bit computer; the other four are isolated virtual machines, each linked separately to the computer.

![Earthenware tree](docs/tree.png)

| Beginning | Steps | Blocks | Nodes |
|---|---|---|---|
| C (computer) | 2 | 4 | 7 |
| VM1 | 2 | 4 | 7 |
| VM2 | 2 | 4 | 7 |
| VM3 | 2 | 2 | 5 |
| VM4 | 1 | 1 | 3 |
| **Total: 5** | **9** | **15** | **29** |

Full structure: [`tree.json`](tree.json) (id, kind, level, parent, owner). Each VM links separately to `C`.

## Run (Python 3, stdlib only)

```
python3 main.py          # boot computer, run 4 VMs round-robin, print trace + host output
python3 -m unittest      # tests
```

## Computer tree -> 8-bit CPU (`cpu8.py`)

| Node | Level | Hardware |
|---|---|---|
| `C` | beginning | Control unit (fetch/decode/execute) |
| `C.alu` | step | ALU (ADD/SUB, mod-256 wrap, zero flag) |
| `C.mem` | step | Memory controller (256-byte memory) |
| `C.alu.a` | block | Register A (accumulator) |
| `C.alu.z` | block | Z flag register |
| `C.mem.pc` | block | PC register |
| `C.mem.io` | block | IO port: OUT buffer + VM links |

Instructions are 2 bytes (opcode, operand): `HALT LOAD addr, LDI imm, STORE addr, ADD addr, SUB addr, JMP addr, JZ addr, OUT, SEND [link], RECV [link]`. On the host the SEND/RECV operand is the VM id; RECV on an empty queue waits (PC does not advance).

## VMs (`vm.py`)

Each VM owns its tree nodes, a private `CPU8` (own memory + registers), and one `Link` (two queues) to the host. No memory is shared between VMs.

Demo: VM1 `200+100=44`, VM2 `10-20=246`, VM3 loop sum `5+4+3+2+1=15`, VM4 `255+1=0` → JZ → sends `42`. Host receives each, OUTs it, then OUTs the 8-bit sum: `HOST OUTPUT: [44, 246, 15, 42, 91]`.
