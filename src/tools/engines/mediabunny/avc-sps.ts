/**
 * Frame size from an H.264 sequence parameter set (ITU-T H.264 §7.3.2.1.1). mediabunny's MPEG-TS
 * reader derives the size from the SPS itself and drops the `frame_mbs_only_flag` factor, so an
 * interlaced 720×576 broadcast or AVCHD stream reads as 720×288 (one field). The inspector corrects
 * it with this. Pure; unit-tested. No network access.
 */

export interface AvcFrameSize {
  width: number;
  height: number;
  /** False for field or MBAFF coding (interlaced). */
  frameMbsOnly: boolean;
}

/** SPS NAL units (type 7) of an Annex B access unit (start-code framed, as in MPEG-TS). */
export function annexBSps(data: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let start = -1;
  const push = (end: number) => {
    if (start >= 0 && ((data[start] ?? 0) & 0x1f) === 7) out.push(data.subarray(start, end));
  };
  for (let i = 0; i + 2 < data.length; i++) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      push(i > 0 && data[i - 1] === 0 ? i - 1 : i);
      start = i + 3;
      i += 2;
    }
  }
  push(data.length);
  return out;
}

class Bits {
  private pos = 0;
  constructor(private readonly b: Uint8Array) {}
  u(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.b[this.pos >> 3];
      if (byte === undefined) throw new RangeError("SPS ended early");
      v = (v << 1) | ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v >>> 0;
  }
  ue(): number {
    let zeros = 0;
    while (this.u(1) === 0) {
      if (++zeros > 31) throw new RangeError("bad Exp-Golomb code");
    }
    return zeros === 0 ? 0 : 2 ** zeros - 1 + this.u(zeros);
  }
  se(): number {
    const k = this.ue();
    return k % 2 ? (k + 1) / 2 : -(k / 2);
  }
}

/** Removes emulation-prevention bytes (00 00 03 → 00 00). */
function rbsp(nal: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < nal.length; i++) {
    if (i >= 2 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) continue;
    out.push(nal[i] ?? 0);
  }
  return Uint8Array.from(out);
}

const HIGH_PROFILES = new Set([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135]);

/** Frame size of an SPS NAL unit (header byte included), or undefined when it cannot be read. */
export function parseAvcSps(nal: Uint8Array): AvcFrameSize | undefined {
  try {
    const r = new Bits(rbsp(nal.subarray(1)));
    const profile = r.u(8);
    r.u(16); // constraint flags, level
    r.ue(); // seq_parameter_set_id
    let chroma = 1;
    if (HIGH_PROFILES.has(profile)) {
      chroma = r.ue();
      if (chroma === 3) r.u(1); // separate_colour_plane_flag
      r.ue(); // bit_depth_luma_minus8
      r.ue(); // bit_depth_chroma_minus8
      r.u(1); // qpprime_y_zero_transform_bypass_flag
      if (r.u(1)) {
        // seq_scaling_matrix_present_flag: skip the scaling lists
        for (let i = 0; i < (chroma === 3 ? 12 : 8); i++) {
          if (!r.u(1)) continue;
          const size = i < 6 ? 16 : 64;
          let last = 8;
          let next = 8;
          for (let j = 0; j < size && next !== 0; j++) {
            next = (last + r.se() + 256) % 256;
            if (next !== 0) last = next;
          }
        }
      }
    }
    r.ue(); // log2_max_frame_num_minus4
    const pocType = r.ue();
    if (pocType === 0) r.ue();
    else if (pocType === 1) {
      r.u(1);
      r.se();
      r.se();
      const n = r.ue();
      for (let i = 0; i < n; i++) r.se();
    }
    r.ue(); // max_num_ref_frames
    r.u(1); // gaps_in_frame_num_value_allowed_flag
    const widthMbs = r.ue() + 1;
    const heightMapUnits = r.ue() + 1;
    const frameMbsOnly = r.u(1) === 1;
    if (!frameMbsOnly) r.u(1); // mb_adaptive_frame_field_flag
    r.u(1); // direct_8x8_inference_flag
    let [left, right, top, bottom] = [0, 0, 0, 0];
    if (r.u(1)) [left, right, top, bottom] = [r.ue(), r.ue(), r.ue(), r.ue()];
    const fieldFactor = frameMbsOnly ? 1 : 2;
    const cropX = chroma === 1 || chroma === 2 ? 2 : 1;
    const cropY = (chroma === 1 ? 2 : 1) * fieldFactor;
    return {
      width: widthMbs * 16 - cropX * (left + right),
      height: heightMapUnits * 16 * fieldFactor - cropY * (top + bottom),
      frameMbsOnly,
    };
  } catch {
    return undefined;
  }
}
