"""
Dev-only: reference outputs of the official ONNX model, for the parity tests of our WebGL 2 kit
(tests/unit/vision-*.test.ts, tests/e2e/vision.spec.ts). Nothing here ships.

Usage (Python 3.10+ with onnx, onnxruntime, numpy, opencv-python-headless and scikit-image in a
throwaway venv):
    python scripts/vision/make_references.py face_detection_yunet_2026may.onnx \
        public/models/yunet/yunet-2026may.vnn tests/fixtures/vision
then `pnpm exec biome format --write` the JSON files it wrote (the repository formats JSON).

Writes, in the kit's own file layout (VNN1 header, then data; see onnx_to_vision.py) with dtype f32:
    yunet-layers.f32    a 64x64 input (the face of scikit-image's `astronaut`, NASA, public domain)
                        and every layer's output, run by onnxruntime with no graph optimisation
    yunet-astronaut.f32 the twelve outputs for the whole 512x512 `astronaut` image
and copies astronaut.png (the exact pixels the second file came from). Also writes
yunet-opencv.json: OpenCV's own FaceDetectorYN (decode and NMS included) on the same image at
score 0.5, NMS 0.3, the decode reference.
"""

import json
import os
import struct
import sys

import cv2
import numpy as np
import onnx
import onnxruntime as ort
from skimage import data as skdata


def read_vnn_header(path):
    raw = open(path, "rb").read()
    assert raw[:4] == b"VNN1"
    (n,) = struct.unpack("<I", raw[4:8])
    return json.loads(raw[8 : 8 + n])


def write_f32(path, tensors, meta):
    table, chunks, offset = {}, [], 0
    for key, arr in tensors.items():
        a = np.ascontiguousarray(arr, dtype=np.float32)
        table[key] = {"shape": list(a.shape), "offset": offset, "length": int(a.size)}
        chunks.append(a.tobytes())
        offset += a.nbytes
    header = {"format": "vnn/1", "dtype": "f32", **meta, "tensors": table}
    js = json.dumps(header, separators=(",", ":")).encode()
    js += b" " * ((-(8 + len(js))) % 8)
    with open(path, "wb") as f:
        f.write(b"VNN1")
        f.write(struct.pack("<I", len(js)))
        f.write(js)
        for c in chunks:
            f.write(c)
    print(path, 8 + len(js) + offset, "bytes")


def session(onnx_path, extra_outputs):
    model = onnx.load(onnx_path)
    have = {o.name for o in model.graph.output}
    for name in extra_outputs:
        if name not in have:
            model.graph.output.append(onnx.helper.make_tensor_value_info(name, onnx.TensorProto.FLOAT, None))
    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
    return ort.InferenceSession(model.SerializeToString(), opts, providers=["CPUExecutionProvider"])


def to_input(rgb):
    """RGB uint8 HxWx3 -> 1x3xHxW float32 BGR 0..255, as OpenCV's blobFromImage(bgr image)."""
    bgr = rgb[:, :, ::-1].astype(np.float32)
    return np.ascontiguousarray(bgr.transpose(2, 0, 1)[None])


def main():
    onnx_path, vnn_path, out_dir = sys.argv[1:4]
    os.makedirs(out_dir, exist_ok=True)
    header = read_vnn_header(vnn_path)
    layer_outs = [layer["out"] for layer in header["layers"]]
    outputs = [o["name"] for o in header["outputs"]]

    astronaut = skdata.astronaut()  # 512x512 RGB
    # 1. Every layer on a small input: the face, 64x64.
    face = cv2.resize(np.ascontiguousarray(astronaut[40:232, 140:332]), (64, 64), interpolation=cv2.INTER_AREA)
    sess = session(onnx_path, layer_outs)
    names = [o.name for o in sess.get_outputs()]
    x = to_input(face)
    res = dict(zip(names, sess.run(None, {"input": x})))
    tensors = {"input": x}
    for name in layer_outs:
        tensors[name] = res[name]
    for name in outputs:
        tensors[name] = res[name]
    write_f32(
        os.path.join(out_dir, "yunet-layers.f32"),
        tensors,
        {"name": "yunet-2026may layers, astronaut face 64x64", "runtime": f"onnxruntime {ort.__version__}"},
    )

    # 2. The whole image, final outputs only.
    png = os.path.join(out_dir, "astronaut.png")
    cv2.imwrite(png, cv2.cvtColor(astronaut, cv2.COLOR_RGB2BGR))
    rgb = cv2.cvtColor(cv2.imread(png), cv2.COLOR_BGR2RGB)
    assert np.array_equal(rgb, astronaut)
    sess2 = session(onnx_path, [])
    res2 = dict(zip([o.name for o in sess2.get_outputs()], sess2.run(None, {"input": to_input(rgb)})))
    write_f32(
        os.path.join(out_dir, "yunet-astronaut.f32"),
        {name: res2[name] for name in outputs},
        {"name": "yunet-2026may outputs, astronaut 512x512", "runtime": f"onnxruntime {ort.__version__}"},
    )

    # 3. OpenCV's decode and NMS on the same image.
    det = cv2.FaceDetectorYN.create(onnx_path, "", (512, 512), 0.5, 0.3, 5000)
    _, faces = det.detect(cv2.imread(png))
    faces = [] if faces is None else faces.tolist()
    with open(os.path.join(out_dir, "yunet-opencv.json"), "w") as f:
        json.dump(
            {
                "opencv": cv2.__version__,
                "image": "astronaut.png",
                "scoreThreshold": 0.5,
                "nmsThreshold": 0.3,
                "faces": [{"box": r[0:4], "landmarks": r[4:14], "score": r[14]} for r in faces],
            },
            f,
            indent=1,
        )
    print("opencv faces", len(faces), [[round(v, 1) for v in r[:4]] + [round(r[14], 4)] for r in faces])


if __name__ == "__main__":
    main()
