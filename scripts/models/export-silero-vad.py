# Reproduces public/models/silero-vad/silero-vad-16k-6.2.3-f16.safetensors (ADR-0109). Dev-only.
#
# The 16 kHz weights of the official Silero VAD TorchScript model shipped in the PyPI package
# silero-vad 6.2.3 (MIT), written as float16 with the tensor names of the package's own
# silero_vad_16k.safetensors / tinygrad_model.py. The package's safetensors file holds weights that
# differ from the ONNX and TorchScript models it ships (98.8 to 99.8% frame agreement on our fixtures);
# these are the weights of the models everyone runs, at half the size.
#
#   python -m venv venv && venv/bin/pip install silero-vad==6.2.3 safetensors
# No metadata is written, so the output is byte for byte the same on every run.
#   venv/bin/python scripts/models/export-silero-vad.py public/models/silero-vad/silero-vad-16k-6.2.3-f16.safetensors
import sys, warnings, torch
from silero_vad import load_silero_vad
from safetensors.torch import save_file

warnings.filterwarnings("ignore")
names = {
    "stft.forward_basis_buffer": "stft_conv.weight",
    "decoder.rnn.weight_ih": "lstm_cell.weight_ih",
    "decoder.rnn.weight_hh": "lstm_cell.weight_hh",
    "decoder.rnn.bias_ih": "lstm_cell.bias_ih",
    "decoder.rnn.bias_hh": "lstm_cell.bias_hh",
    "decoder.decoder.2.weight": "final_conv.weight",
    "decoder.decoder.2.bias": "final_conv.bias",
}
for i in range(4):
    names[f"encoder.{i}.reparam_conv.weight"] = f"conv{i + 1}.weight"
    names[f"encoder.{i}.reparam_conv.bias"] = f"conv{i + 1}.bias"
state = load_silero_vad()._model.state_dict()
save_file({names[k]: v.detach().to(torch.float16).contiguous() for k, v in state.items()}, sys.argv[1])
