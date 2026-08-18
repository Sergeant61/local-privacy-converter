import { describe, expect, it } from "vitest";

import {
  buildLoudnormApplyArgs,
  buildLoudnormMeasureArgs,
  buildLoudnormSinglePassArgs,
  parseLoudnormJson
} from "./loudnorm";

const targets = { targetLufs: -14, truePeak: -1, lra: 11 };

const sampleStderr = `
ffmpeg version 7.0 Copyright (c) 2000-2024
  Stream #0:0: Audio: aac, 48000 Hz, stereo
[Parsed_loudnorm_0 @ 0x600] 
{
	"input_i" : "-20.30",
	"input_tp" : "-4.19",
	"input_lra" : "1.50",
	"input_thresh" : "-30.34",
	"output_i" : "-13.99",
	"target_offset" : "-0.01"
}
`;

// ── README doğruluğu ────────────────────────────────────────────────────────
// README "EBU R128 loudness normalization" diyordu ama tek geçiş çalışıyordu:
// −14 LUFS isteğinde ölçüm −14.5 veriyordu.
describe("iki geçişli loudnorm", () => {
  it("birinci geçiş yalnızca ölçer, dosya yazmaz", () => {
    const args = buildLoudnormMeasureArgs("/tmp/in.wav", targets);
    expect(args[args.indexOf("-af") + 1]).toContain("print_format=json");
    expect(args.slice(-3)).toEqual(["-f", "null", "-"]);
    expect(args).not.toContain("-y");
  });

  it("ölçüm JSON'unu banner ve ilerleme satırları arasından çıkarır", () => {
    const m = parseLoudnormJson(sampleStderr);
    expect(m).toMatchObject({
      input_i: "-20.30",
      input_tp: "-4.19",
      input_lra: "1.50",
      input_thresh: "-30.34",
      target_offset: "-0.01"
    });
  });

  it("ölçüm alınamazsa null döner — yanlış değerle ikinci geçiş yapılmaz", () => {
    expect(parseLoudnormJson("hiç JSON yok")).toBeNull();
    expect(parseLoudnormJson("{ bozuk")).toBeNull();
    expect(parseLoudnormJson('{"input_i":"x"}')).toBeNull();
  });

  it("tümüyle sessiz girdiyi (-inf) reddeder", () => {
    const silent = `{"input_i":"-inf","input_tp":"-inf","input_lra":"0.00","input_thresh":"-inf","target_offset":"0.00"}`;
    expect(parseLoudnormJson(silent)).toBeNull();
  });

  it("ikinci geçiş ölçülen değerleri filtreye geri verir", () => {
    const m = parseLoudnormJson(sampleStderr)!;
    const args = buildLoudnormApplyArgs("/tmp/in.wav", "/tmp/out.wav", targets, m);
    const filter = args[args.indexOf("-af") + 1]!;
    expect(filter).toContain("measured_I=-20.30");
    expect(filter).toContain("measured_TP=-4.19");
    expect(filter).toContain("measured_LRA=1.50");
    expect(filter).toContain("measured_thresh=-30.34");
    expect(filter).toContain("offset=-0.01");
    expect(filter).toContain("linear=true");
    expect(args.at(-1)).toBe("/tmp/out.wav");
  });

  it("hedefler her iki geçişte de aynı", () => {
    const m = parseLoudnormJson(sampleStderr)!;
    for (const args of [
      buildLoudnormMeasureArgs("/tmp/in.wav", targets),
      buildLoudnormApplyArgs("/tmp/in.wav", "/tmp/out.wav", targets, m),
      buildLoudnormSinglePassArgs("/tmp/in.wav", "/tmp/out.wav", targets)
    ]) {
      const filter = args[args.indexOf("-af") + 1]!;
      expect(filter).toContain("I=-14");
      expect(filter).toContain("TP=-1");
      expect(filter).toContain("LRA=11");
    }
  });

  it("geri düşüş tek geçişli ve yine de çıktı üretir", () => {
    const args = buildLoudnormSinglePassArgs("/tmp/in.wav", "/tmp/out.wav", targets);
    expect(args).toContain("-y");
    expect(args.at(-1)).toBe("/tmp/out.wav");
    expect(args.join(" ")).not.toContain("measured_");
  });
});
