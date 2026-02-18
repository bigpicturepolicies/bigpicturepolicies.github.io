#!/usr/bin/env python3
"""
Extract frames from videos at regular intervals for faster web loading.

This script extracts frames from the scroll animation videos and saves them
as JPEG images. This eliminates the slow "Caching frames..." step that
extracts frames from video at runtime.

Usage:
    python extract_frames.py

Requirements:
    - ffmpeg (brew install ffmpeg)
"""

import subprocess
import os
from pathlib import Path

# Configuration matching script.js
DURATION = 25.0  # total video duration

# Per-video settings: (path, interval, width, height, quality)
VIDEOS = {
    "wrist": {
        "path": "videos/marshmallow_keyframes_success_filmstrip/marshmallow_keyframes_success_wrist_cam.mp4",
        "interval": 0.1,  # 10 FPS
        "width": 424,
        "height": 240,
        "quality": 10,
    },
    "overhead": {
        "path": "videos/marshmallow_keyframes_success_filmstrip/marshmallow_keyframes_success_overhead.mp4",
        "interval": 0.333,  # 3 FPS
        "width": 848,
        "height": 480,
        "quality": 2,
    },
}


def extract_frames_ffmpeg(video_path: str, output_dir: Path, prefix: str, config: dict) -> int:
    """Extract frames from a video using ffmpeg."""
    fps = 1.0 / config["interval"]
    width = config["width"]
    height = config["height"]
    quality = config["quality"]

    output_pattern = str(output_dir / f"{prefix}_%04d.jpg")

    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-vf", f"fps={fps},scale={width}:{height}",
        "-q:v", str(quality),
        "-y",  # overwrite existing files
        output_pattern
    ]

    print(f"  Running: {' '.join(cmd[:6])} ...")

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"  Error: {result.stderr}")
        return 0

    # Count generated files
    count = len(list(output_dir.glob(f"{prefix}_*.jpg")))
    return count


def main():
    script_dir = Path(__file__).parent
    output_dir = script_dir / "frames"

    # Create output directory
    output_dir.mkdir(exist_ok=True)
    print(f"Output directory: {output_dir}")

    total_extracted = 0

    for prefix, config in VIDEOS.items():
        video_path = script_dir / config["path"]

        if not video_path.exists():
            # Try resolving symlink
            if video_path.is_symlink():
                real_path = video_path.resolve()
                if not real_path.exists():
                    print(f"Error: Video not found: {video_path} -> {real_path}")
                    continue
                video_path = real_path
            else:
                print(f"Error: Video not found: {video_path}")
                continue

        # Delete old frames for this prefix
        old_frames = list(output_dir.glob(f"{prefix}_*.jpg"))
        for f in old_frames:
            f.unlink()
        if old_frames:
            print(f"\nDeleted {len(old_frames)} old {prefix} frames")

        print(f"\nExtracting {prefix} frames from {video_path}...")
        print(f"  Settings: {config['width']}x{config['height']}, {1/config['interval']:.1f} FPS, quality {config['quality']}")
        count = extract_frames_ffmpeg(str(video_path), output_dir, prefix, config)
        total_extracted += count
        print(f"  Extracted {count} frames for {prefix}")

    # Rename frames to be 0-indexed (ffmpeg starts at 1)
    print("\nRenaming frames to 0-indexed...")
    for prefix in VIDEOS.keys():
        frames = sorted(output_dir.glob(f"{prefix}_*.jpg"))
        for i, frame in enumerate(frames):
            new_name = output_dir / f"{prefix}_{i:04d}.jpg"
            if frame != new_name:
                frame.rename(new_name)

    print(f"\nDone! Total frames extracted: {total_extracted}")
    print(f"Frames saved to: {output_dir}")

    # Print estimated total size
    total_size = sum(f.stat().st_size for f in output_dir.glob("*.jpg"))
    print(f"Total size: {total_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
