import unittest
from cpu8 import CPU8, assemble
from vm import VM
import main


class TestWrap(unittest.TestCase):
    def test_add_wraps(self):
        c = CPU8(); c.load(assemble([("LDI", 250), ("ADD", 0x80), ("OUT",), ("HALT",)])); c.memc.write(0x80, 10)
        self.assertEqual(c.run(), [4])

    def test_sub_wraps_and_zero(self):
        c = CPU8(); c.load(assemble([("LDI", 0), ("SUB", 0x80), ("OUT",), ("ADD", 0x80), ("JZ", 12), ("HALT",), ("OUT",), ("HALT",)])); c.memc.write(0x80, 1)
        self.assertEqual(c.run(), [255, 0])

    def test_ldi_masks(self):
        self.assertEqual(assemble([("LDI", 300)])[1], 44)


class TestVMs(unittest.TestCase):
    def test_isolation(self):
        a = VM(1, [], assemble([("LDI", 7), ("STORE", 0x80), ("HALT",)]))
        b = VM(2, [], assemble([("LOAD", 0x80), ("SEND",), ("HALT",)]))
        for _ in range(5): a.step(); b.step()
        self.assertEqual(a.cpu.memc.read(0x80), 7)
        self.assertEqual(list(b.link.to_host), [0])
        self.assertIsNot(a.cpu.memc.mem, b.cpu.memc.mem)
        self.assertIsNot(a.link, b.link)

    def test_link_messaging(self):
        vm = VM(1, [], assemble([("RECV",), ("ADD", 0x80), ("SEND",), ("HALT",)]))
        vm.cpu.memc.write(0x80, 1)
        host = CPU8("H", links={1: vm.link})
        host.load(assemble([("LDI", 41), ("SEND", 1), ("RECV", 1), ("OUT",), ("HALT",)]))
        for _ in range(20): vm.step(); host.step()
        self.assertEqual(host.output, [42])

    def test_full_demo(self):
        host, vms = main.run(verbose=False)
        self.assertEqual(host.output, [44, 246, 15, 42, (44 + 246 + 15 + 42) & 0xFF])
        self.assertTrue(all(v.halted for v in vms))


class TestTree(unittest.TestCase):
    def setUp(self): self.nodes = main.load_tree()["nodes"]

    def count(self, level): return sum(n["level"] == level for n in self.nodes)

    def test_counts(self):
        self.assertEqual((self.count("beginning"), self.count("step"), self.count("block")), (5, 9, 15))
        self.assertEqual(len(self.nodes), 29)
        self.assertEqual(sum(n["kind"] == "computer" for n in self.nodes), 7)

    def test_vm_shapes(self):
        for vm, shape in (("VM1", (1, 2, 4)), ("VM2", (1, 2, 4)), ("VM3", (1, 2, 2)), ("VM4", (1, 1, 1))):
            ns = [n for n in self.nodes if n["owner"] == vm]
            self.assertEqual(tuple(sum(n["level"] == l for n in ns) for l in ("beginning", "step", "block")), shape)

    def test_parents_valid(self):
        ids = {n["id"] for n in self.nodes}
        for n in self.nodes:
            self.assertTrue(n["parent"] is None or n["parent"] in ids)
