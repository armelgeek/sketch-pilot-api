import { execSync, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface VideoFileInfo {
  videoPath: string;
  outputDir: string;
  relativePath: string;
}

async function findAllVideos(startPath: string): Promise<VideoFileInfo[]> {
  const videos: VideoFileInfo[] = [];
  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];

  function walkDir(dir: string) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        walkDir(filePath);
      } else if (videoExtensions.includes(path.extname(file).toLowerCase())) {
        const relativePath = path.relative(startPath, filePath);
        const videoDir = path.dirname(filePath);
        const outputDir = path.join(videoDir, 'frames');

        videos.push({
          videoPath: filePath,
          outputDir,
          relativePath,
        });
      }
    }
  }

  walkDir(startPath);
  return videos;
}

async function extractFrames(videoPath: string, outputDir: string): Promise<void> {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const pattern = path.join(outputDir, 'frame-%04d.png');

  console.log(`⏳ Extracting frames from: ${videoPath}`);
  console.log(`📁 Output directory: ${outputDir}`);

  try {
    // Added -nostdin to prevent ffmpeg from waiting for user input
    await execAsync(`ffmpeg -nostdin -i "${videoPath}" -vf "fps=30" "${pattern}"`, {
      maxBuffer: 1024 * 1024 * 10,
    });

    const frameCount = fs.readdirSync(outputDir).filter((f) => f.endsWith('.png')).length;
    console.log(`✅ Extracted ${frameCount} frames`);
  } catch (error) {
    console.error(`❌ Error extracting frames from ${videoPath}:`, error);
  }
}

async function main() {
  const samplesDir = path.join(__dirname, 'samples');

  if (!fs.existsSync(samplesDir)) {
    console.error(`❌ Samples directory not found: ${samplesDir}`);
    process.exit(1);
  }

  console.log('🎬 Starting frame extraction process...\n');

  const videos = await findAllVideos(samplesDir);

  if (videos.length === 0) {
    console.log('❌ No video files found in samples directory');
    process.exit(1);
  }

  console.log(`📹 Found ${videos.length} video(s) to process\n`);

  for (const video of videos) {
    await extractFrames(video.videoPath, video.outputDir);
  }

  console.log('\n✨ Frame extraction completed!');
  console.log(`📁 Frames saved in: ${path.join(samplesDir, 'extracted-frames')}`);
}

main().catch(console.error);
