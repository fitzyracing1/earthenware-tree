"""Boot the Earthenware Computer, start 4 VMs, round-robin them on the host."""
import json, os
from cpu8 import CPU8, assemble
from vm import VM

HERE = os.path.dirname(os.path.abspath(__file__))

# Demo programs (code at 0, data at 0x80).
PROGRAMS = {
    1: assemble([("LDI", 200), ("ADD", 0x80), ("SEND",), ("HALT",)]),          # 200+100 = 44 (wraps)
    2: assemble([("LDI", 10), ("SUB", 0x80), ("SEND",), ("HALT",)]),           # 10-20 = 246 (wraps)
    3: assemble([("LDI", 0), ("STORE", 0x81),                                   # sum 5+4+3+2+1 = 15
                 ("LOAD", 0x81), ("ADD", 0x82), ("STORE", 0x81),
                 ("LOAD", 0x82), ("SUB", 0x80), ("STORE", 0x82),
                 ("JZ", 20), ("JMP", 4),
                 ("LOAD", 0x81), ("SEND",), ("HALT",)]),
    4: assemble([("LDI", 255), ("ADD", 0x80), ("JZ", 8), ("HALT",),             # 255+1 = 0 -> JZ taken
                 ("LDI", 42), ("SEND",), ("HALT",)]),
}
DATA = {1: {0x80: 100}, 2: {0x80: 20}, 3: {0x80: 1, 0x82: 5}, 4: {0x80: 1}}
# Host: receive one value from each VM link, OUT it, then sum them.
HOST = assemble([("RECV", 1), ("OUT",), ("STORE", 0x90),
                 ("RECV", 2), ("OUT",), ("ADD", 0x90), ("STORE", 0x90),
                 ("RECV", 3), ("OUT",), ("ADD", 0x90), ("STORE", 0x90),
                 ("RECV", 4), ("OUT",), ("ADD", 0x90), ("OUT",), ("HALT",)])


def load_tree():
    with open(os.path.join(HERE, "tree.json")) as f:
        return json.load(f)


def build():
    tree = load_tree()
    vms = []
    for v in range(1, 5):
        nodes = [n for n in tree["nodes"] if n["owner"] == f"VM{v}"]
        vm = VM(v, nodes, PROGRAMS[v])
        for addr, val in DATA[v].items():
            vm.cpu.memc.write(addr, val)
        vms.append(vm)
    host = CPU8("HOST", links={vm.vm_id: vm.link for vm in vms})
    host.load(HOST)
    return tree, host, vms


def run(verbose=True, max_rounds=1000):
    tree, host, vms = build()
    log = print if verbose else (lambda *a: None)
    comp = [n for n in tree["nodes"] if n["kind"] == "computer"]
    log(f"BOOT computer: {len(comp)} nodes ({', '.join(n['id'] for n in comp)})")
    for vm in vms:
        log(f"START VM{vm.vm_id}: {len(vm.nodes)} nodes, link VM{vm.vm_id}<->C")
    for r in range(max_rounds):
        if host.halted and all(v.halted for v in vms):
            break
        for unit in [*(v.cpu for v in vms), host]:  # round-robin, 1 instr each
            t = unit.step()
            if t: log(f"[r{r:02d}] {t}")
    log(f"HOST OUTPUT: {host.output}")
    return host, vms


if __name__ == "__main__":
    run()
