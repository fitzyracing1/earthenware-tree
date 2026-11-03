# Earthenware Llama (VM6)

Pinned reference to [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT) — no code vendored.
See `product.json` for the exact commit; `LICENSE` is upstream's, unmodified; `NOTICE` credits the original authors.

Entry: `llama-server -m models/MODEL.gguf --host 127.0.0.1 --port 8080`

`models/MODEL.gguf` is a placeholder: download any small GGUF model (e.g. a ~0.5B
Qwen2.5-Instruct Q4_K_M) into `products/llama.cpp/models/` and rename or edit the path.
Build or install `llama-server` from upstream (`brew install llama.cpp`, or cmake build).
