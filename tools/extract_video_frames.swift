// Extract every frame of a video as JPEG (no ffmpeg needed). usage: swiftc -O tools/extract_video_frames.swift -o /tmp/frames && /tmp/frames in.mp4 out_dir  (fixed 24 fps / 240 frames: edit `fps`/`n` for other clips)
// Used for art/reference/new_ninja_katana/ninja_walk_katana.mp4 -> walk_frames/frame_001.jpg ...
import AVFoundation
import ImageIO
import UniformTypeIdentifiers
let args = CommandLine.arguments
let url = URL(fileURLWithPath: args[1]); let outDir = args[2]
try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
let asset = AVURLAsset(url: url)
let gen = AVAssetImageGenerator(asset: asset)
gen.requestedTimeToleranceBefore = .zero; gen.requestedTimeToleranceAfter = .zero
gen.appliesPreferredTrackTransform = true
let fps = 24.0, n = 240
let sem = DispatchSemaphore(value: 0)
Task {
  var ok = 0
  for i in 0..<n {
    let t = CMTime(value: CMTimeValue(i), timescale: 24)
    do {
      let (img, actual) = try await gen.image(at: t)
      let path = outDir + String(format: "/frame_%03d.jpg", i + 1)
      let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
      CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: 0.93] as CFDictionary)
      CGImageDestinationFinalize(dest); ok += 1
      if i < 2 || i == n - 1 { print(i + 1, "req", CMTimeGetSeconds(t), "got", CMTimeGetSeconds(actual), img.width, "x", img.height) }
    } catch { print("frame", i + 1, "failed:", error) }
  }
  print("written", ok, "of", n, "fps", fps)
  sem.signal()
}
sem.wait()
