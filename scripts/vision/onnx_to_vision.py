"""
Dev-only: turns a small ONNX convolutional network into the file our WebGL 2 inference kit reads
(src/tools/engines/vision/model-file.ts). Nothing here ships; the output file does.

Usage (Python 3.10+ with `onnx` and `numpy` in a throwaway venv):
    python scripts/vision/onnx_to_vision.py face_detection_yunet_2026may.onnx \
        public/models/yunet/yunet-2026may.vnn --name yunet-2026may --licence MIT

File layout (little endian):
    bytes 0..3   ASCII "VNN1"
    bytes 4..7   uint32 N, the length of the JSON header
    bytes 8..    N bytes of UTF-8 JSON, padded with spaces so the data starts on an 8-byte boundary
    then         every tensor as IEEE 754 half floats, in the order and at the offsets the header lists

The header holds the layer list (the graph after fusing), the tensor table and the provenance
(source file, its SHA-256, licence). Weights keep ONNX's OIHW layout; the kit packs them for the GPU.

Fusions, all exact (no arithmetic changes):
    Conv -> Relu                       conv with act "relu"
    Conv -> [Transpose, Reshape] -> Sigmoid   conv with act "sigmoid", an output
    Resize(nearest, x2, asymmetric, floor) -> Add   "upadd": a + up2(b)
    Transpose(0,2,3,1) -> Reshape(1,-1,C)  the output layout (anchors in row-major order, C each);
                                       the conv feeding an output is named after it
Any other pattern stops the script: the kit only implements what it was checked against.
"""

import argparse
import hashlib
import json
import struct
import sys

import numpy as np
import onnx
from onnx import numpy_helper


def attrs(node):
    return {a.name: onnx.helper.get_attribute_value(a) for a in node.attribute}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("onnx_path")
    ap.add_argument("out_path")
    ap.add_argument("--name", required=True)
    ap.add_argument("--licence", required=True)
    args = ap.parse_args()

    raw = open(args.onnx_path, "rb").read()
    model = onnx.load_from_string(raw)
    g = model.graph
    inits = {t.name: numpy_helper.to_array(t) for t in g.initializer}
    consumers = {}
    for n in g.node:
        for i in n.input:
            consumers.setdefault(i, []).append(n)
    producer = {o: n for n in g.node for o in n.output}
    graph_outputs = [o.name for o in g.output]
    inp = g.input[0]
    in_name = inp.name
    in_channels = inp.type.tensor_type.shape.dim[1].dim_value

    def only_consumer(name):
        c = consumers.get(name, [])
        return c[0] if len(c) == 1 else None

    layers = []
    tensors = {}
    channels = {in_name: in_channels}
    # Layer output -> final output name, for outputs reached through layout ops.
    outputs = {}
    done = set()

    def add_tensor(key, arr):
        tensors[key] = arr.astype(np.float32)

    for n in g.node:
        if n.name in done:
            continue
        a = attrs(n)
        if n.op_type == "Conv":
            w = inits[n.input[1]]
            b = inits[n.input[2]] if len(n.input) > 2 else np.zeros(w.shape[0], np.float32)
            cout, cin_g, kh, kw = w.shape
            group = a.get("group", 1)
            cin = cin_g * group
            assert kh == kw, n.name
            assert a.get("dilations", [1, 1]) == [1, 1], n.name
            strides = a.get("strides", [1, 1])
            pads = a.get("pads", [0, 0, 0, 0])
            assert strides[0] == strides[1] and len(set(pads)) == 1, n.name
            assert group in (1, cin) and (group == 1 or cout == cin), n.name
            assert channels[n.input[0]] == cin, n.name
            act = "none"
            out = n.output[0]
            nxt = only_consumer(out)
            if nxt is not None and nxt.op_type == "Relu":
                act = "relu"
                done.add(nxt.name)
                out = nxt.output[0]
            else:
                # Conv -> Transpose(0,2,3,1) -> Reshape -> (Sigmoid) -> graph output
                t = nxt
                if t is not None and t.op_type == "Transpose" and attrs(t)["perm"] == [0, 2, 3, 1]:
                    r = only_consumer(t.output[0])
                    assert r is not None and r.op_type == "Reshape", n.name
                    shape = inits[r.input[1]].tolist()
                    assert shape[0] == 1 and shape[-1] == cout, (n.name, shape)
                    done.update([t.name, r.name])
                    final = r.output[0]
                    s = only_consumer(final)
                    if s is not None and s.op_type == "Sigmoid":
                        act = "sigmoid"
                        done.add(s.name)
                        final = s.output[0]
                    assert final in graph_outputs, n.name
                    # The layer is named after the output it becomes (stored CHW; the output is
                    # the same values with channels last).
                    out = final
                    outputs[final] = out
            wkey, bkey = f"{n.name}.w", f"{n.name}.b"
            add_tensor(wkey, w)
            add_tensor(bkey, b)
            layers.append(
                {
                    "op": "conv",
                    "name": n.name,
                    "in": n.input[0],
                    "out": out,
                    "cin": int(cin),
                    "cout": int(cout),
                    "k": int(kh),
                    "stride": int(strides[0]),
                    "pad": int(pads[0]),
                    "group": int(group),
                    "act": act,
                    "w": wkey,
                    "b": bkey,
                }
            )
            channels[out] = int(cout)
        elif n.op_type == "MaxPool":
            assert a["kernel_shape"] == [2, 2] and a["strides"] == [2, 2], n.name
            assert a.get("pads", [0, 0, 0, 0]) == [0, 0, 0, 0] and a.get("ceil_mode", 0) == 0, n.name
            layers.append({"op": "maxpool", "name": n.name, "in": n.input[0], "out": n.output[0], "k": 2, "stride": 2})
            channels[n.output[0]] = channels[n.input[0]]
        elif n.op_type == "Resize":
            assert a["mode"] == b"nearest" and a["coordinate_transformation_mode"] == b"asymmetric", n.name
            assert a.get("nearest_mode", b"round_prefer_floor") == b"floor", n.name
            scales = inits[n.input[2]].tolist()
            assert scales == [1.0, 1.0, 2.0, 2.0], (n.name, scales)
            add = only_consumer(n.output[0])
            assert add is not None and add.op_type == "Add", n.name
            skip = [i for i in add.input if i != n.output[0]][0]
            assert channels[skip] == channels[n.input[0]], n.name
            done.add(add.name)
            layers.append({"op": "upadd", "name": add.name, "in": [skip, n.input[0]], "out": add.output[0]})
            channels[add.output[0]] = channels[skip]
        else:
            sys.exit(f"unsupported node {n.op_type} {n.name}")

    assert set(outputs.keys()) == set(graph_outputs), (outputs.keys(), graph_outputs)

    # Tensor table and data, half floats.
    table = {}
    chunks = []
    offset = 0
    for key, arr in tensors.items():
        h = arr.astype(np.float16)
        if not np.all(np.isfinite(h)):
            sys.exit(f"{key} overflows half float")
        data = h.tobytes()
        table[key] = {"shape": list(arr.shape), "offset": offset, "length": int(arr.size)}
        chunks.append(data)
        offset += len(data)
    header = {
        "format": "vnn/1",
        "name": args.name,
        "source": args.onnx_path.split("/")[-1],
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "licence": args.licence,
        "dtype": "f16",
        "input": {"name": in_name, "channels": int(in_channels)},
        "layers": layers,
        "outputs": [{"name": k, "tensor": outputs[k]} for k in graph_outputs],
        "tensors": table,
    }
    js = json.dumps(header, separators=(",", ":")).encode()
    pad = (-(8 + len(js))) % 8
    js += b" " * pad
    with open(args.out_path, "wb") as f:
        f.write(b"VNN1")
        f.write(struct.pack("<I", len(js)))
        f.write(js)
        for c in chunks:
            f.write(c)
    params = sum(int(t.size) for t in tensors.values())
    # Largest error the half-float rounding puts on any weight, relative to its tensor's largest.
    worst = max(
        float(np.max(np.abs(t.astype(np.float16).astype(np.float32) - t)) / max(float(np.max(np.abs(t))), 1e-12))
        for t in tensors.values()
    )
    print(
        f"{len(layers)} layers, {params} parameters, header {len(js)} B, "
        f"data {offset} B, file {8 + len(js) + offset} B, worst weight rounding {worst:.2e} of the tensor range"
    )


if __name__ == "__main__":
    main()
