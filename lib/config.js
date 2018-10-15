const os = require("os");

function getFfmpegDownloadUrl() {
  const platform = os.platform();
  const arch = os.arch();
  // To-Do: Linux/macOS download urls
  const downloadUrlMap = {
    win32: {
      x86: "https://ffmpeg.zeranoe.com/builds/win32/static/ffmpeg-latest-win32-static.zip",
      x64: "https://ffmpeg.zeranoe.com/builds/win64/static/ffmpeg-latest-win64-static.zip"
    },
    linux: {
      x86: "",
      x64: ""
    },
    darwin: {
      x86: "",
      x64: ""
    }
  };
  return downloadUrlMap[platform][arch];
}

module.exports = {
  ffmpeg: {
    executablePath: `${process.cwd()}/${os.platform() === "win32" ? "bin/ffmpeg.exe" : "bin/ffmpeg"}`,
    args: {
      startAt: "00:00:32",
      quality: "-c:v hevc_nvenc -profile:v main"
    },
    downloadUrl: getFfmpegDownloadUrl()
  },
  skipConvertingPatterns: [

  ],
  renameRules: [
    { match: /[^\w.]/g, replacement: "" },
    { match: /^\./, replacement: "" },
    { match: /\.\./, replacement: "." }
  ],
  srcFolders: [

  ],
  destFolder: ""
};
