import json, os, shutil, sys, tempfile, unittest
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import absorb
from vm import ProcessVM


def fake_api(spdx):
    def api(path):
        if path.endswith("/commits/main"):
            return {"sha": "a" * 40}
        return {"full_name": "someone/tiny-tool", "name": "tiny-tool", "default_branch": "main",
                "html_url": "https://github.com/someone/tiny-tool", "owner": {"login": "someone"},
                "license": {"spdx_id": spdx} if spdx else None}
    return api


class Base(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        shutil.copy(os.path.join(HERE, "tree.json"), self.d)
        t = json.load(open(os.path.join(self.d, "tree.json")))
        t.pop("products", None); t.pop("product_links", None)
        json.dump(t, open(os.path.join(self.d, "tree.json"), "w"))
    def tearDown(self): shutil.rmtree(self.d)


class TestLicenseGate(Base):
    def test_allow(self):
        for s in ("MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"):
            self.assertEqual(absorb.check_license(s), s)
    def test_deny(self):
        for s in ("GPL-3.0", "AGPL-3.0", "NOASSERTION", None, ""):
            with self.assertRaises(absorb.LicenseError):
                absorb.check_license(s)
    def test_absorb_refuses_and_writes_nothing(self):
        with self.assertRaises(absorb.LicenseError):
            absorb.absorb("someone/tiny-tool", root=self.d, api=fake_api(None), license_text="")
        self.assertFalse(os.path.exists(os.path.join(self.d, "products")))


class TestProduct(Base):
    def test_product_json_and_notice(self):
        absorb.absorb("someone/tiny-tool", root=self.d, api=fake_api("MIT"), license_text="MIT text")
        p = os.path.join(self.d, "products", "tiny-tool")
        pj = json.load(open(os.path.join(p, "product.json")))
        self.assertEqual(pj["name"], "Earthenware Tiny Tool")
        self.assertEqual((pj["license"], pj["commit"], pj["vm_slot"]), ("MIT", "a" * 40, 5))
        self.assertEqual(pj["upstream"], "https://github.com/someone/tiny-tool")
        self.assertIn("entry", pj)
        self.assertEqual(open(os.path.join(p, "LICENSE")).read(), "MIT text")
        notice = open(os.path.join(p, "NOTICE")).read()
        self.assertIn("someone", notice); self.assertIn("a" * 40, notice)


class TestTreeGrowth(unittest.TestCase):
    def test_ternary(self):
        tree = {"nodes": [], "links": {}}
        nodes = [absorb.add_product_node(tree, f"p{i}") for i in range(7)]
        self.assertEqual([n["slot"] for n in nodes], list(range(5, 12)))
        self.assertEqual([n["parent"] for n in nodes], ["P"] * 3 + ["VM5"] * 3 + ["VM6"])
        self.assertEqual(tree["product_links"]["P"], "C")
        self.assertTrue(all(tree["product_links"][n["id"]] == "C" for n in nodes))
        self.assertIs(absorb.add_product_node(tree, "p0"), nodes[0])  # idempotent
        kids = {}
        for n in tree["products"]:
            kids[n["parent"]] = kids.get(n["parent"], 0) + 1
        self.assertLessEqual(max(v for k, v in kids.items() if k), 3)

    def test_repo_tree_products_valid(self):
        t = json.load(open(os.path.join(HERE, "tree.json")))
        ids = {n["id"] for n in t.get("products", [])}
        for n in t.get("products", []):
            self.assertTrue(n["parent"] is None or n["parent"] in ids)


class TestProcessVM(unittest.TestCase):
    def test_stdout_to_link(self):
        d = tempfile.mkdtemp()
        try:
            open(os.path.join(d, "fake.py"), "w").write(
                "import os, sys\nprint('hello')\nprint(os.path.basename(os.getcwd()))\n"
                "for l in sys.stdin: print('echo', l.strip())\n")
            vm = ProcessVM(9, "python3 fake.py", d)
            vm.link.to_vm.append("ping")
            self.assertEqual(vm.run(), 0)
            self.assertTrue(vm.halted)
            self.assertEqual(list(vm.link.to_host), ["hello", os.path.basename(d), "echo ping"])
        finally:
            shutil.rmtree(d)
