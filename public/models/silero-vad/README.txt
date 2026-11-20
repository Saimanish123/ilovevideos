Silero VAD 6.2.3, 16 kHz model (voice activity detection)
Copyright (c) 2020-present Silero Team. MIT licence (LICENSE.txt in this folder).

silero-vad-16k-6.2.3-f16.safetensors   620,466 bytes  sha256 cb23d14f8f822e7ff5b6d0320e62490f070e2be748f1a13bf796c46296307a8d
  The 16 kHz weights of the TorchScript model in the PyPI package silero-vad 6.2.3, stored as
  float16 with the tensor names of the package's silero_vad_16k.safetensors. Written by
  scripts/models/export-silero-vad.py (byte for byte reproducible). Run by our own forward pass
  (src/tools/engines/sound/dsp/silero-vad.ts); its speech decisions match the official ONNX model on
  at least 99.89% of 32 ms frames on our fixtures.

Loaded only by remove silence (pauses found by speech) and cut video into Shorts, after a file is
chosen, from this origin, and run on the visitor's device. Nothing is sent anywhere.
