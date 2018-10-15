const request = require("request");
const Promise = require("bluebird");
const { spawn } = Promise.promisifyAll(require("child_process"));
const fs = Promise.promisifyAll(require("fs"));
const unzipper = require("unzipper");

const config = require("./config");
const seasonPicker = /S(\d{2})/;
const episodePicker = /E(\d{2})/;

async function waitSeconds(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function getOutputPath(filename) {
  let newFilename = config.renameRules
    .reduce((name, rule) => name.replace(rule.match, rule.replacement), filename)
    .split(".");
  newFilename.splice(-1, 0, "cutAds");
  newFilename = newFilename.join(".");
  const [ , numSeason] = newFilename.match(seasonPicker) || [];
  const tvSeriesName = newFilename.split(".S")[0].replace(/\./g, " ");
  let tvShowFolderPath = `${config.destFolder}`;
  if (numSeason) {
    tvShowFolderPath = `${tvShowFolderPath}/${tvSeriesName}/Season ${Number(numSeason)}/`;
  }
  try {
    await fs.statAsync(tvShowFolderPath);
  } catch (error) {
    console.warn(`Problem accessing path: ${tvShowFolderPath}. Creating...`);
    await fs.mkdirAsync(tvShowFolderPath, { recursive: true });
  }
  return { outPutFolderPath: tvShowFolderPath, outputFilePath: `${tvShowFolderPath}/${newFilename}` };
}

async function removeFile (path) {
  try {
    await fs.unlinkAsync(path);
    console.log(`File removed successfully: ${path}`);
    return;
  } catch (error) {
    if (error.code === "EBUSY") {
      await waitSeconds(3);
      return await removeFile(path);
    }
    throw new Error(error);
  }
}

/**
 * Convert based on configs.
 */
async function convert(filePath) {
  const [ filename ] = filePath.split("/").slice(-1);
  const { outPutFolderPath, outputFilePath } = await getOutputPath(filename);
  const [ targetEpisode ] = filename.match(episodePicker) || [filename];

  const shouldSkipConverting = config.skipConvertingPatterns.some(pattern => filename.includes(pattern));

  // Remove older versions of same episode.
  const oldEpisodeFiles = (await fs.readdirAsync(outPutFolderPath)).filter(n => n.includes(targetEpisode));
  if (oldEpisodeFiles.length) {
    console.log(`Remove older version(s): ${oldEpisodeFiles}`);
    await Promise.map(oldEpisodeFiles, file => removeFile(`${outPutFolderPath}/${file}`));
  }

  if (shouldSkipConverting) {
    // No need to convert, just move to dest folder.
    await fs.copyFileAsync(filePath, outputFilePath);
    console.log(`File moved: ${outputFilePath}`);
  } else {
    // Need to convert. So start converting.
    const { executablePath } = config.ffmpeg;
    const { startAt, quality } = config.ffmpeg.args;
    console.log(`Converting: ${filename}`);
    await new Promise(resolve => {
      const conversionProcess = spawn(executablePath, [ "-ss", startAt, "-i", `"${filePath}"`, quality, "-y", `"${outputFilePath}"` ], { shell: true, windowsHide: true });
      conversionProcess.stdout.on("data", data => console.log(`[${filename}] ${data.toString("utf-8")}`));
      conversionProcess.stderr.on("data", data => console.log(`[${filename}] ${data.toString("utf-8")}`));
      conversionProcess.on("close", resolve);
    });
    console.log(`${filename} converted.`);
  }
  
  return removeFile(filePath);
}

/**
 * Check if ffmpeg binary file exists. If not, download it.
 */
async function init() {
  const { executablePath } = config.ffmpeg;
  async function downloadFfmpeg() {
    const { downloadUrl } = config.ffmpeg;
    console.log(`Downloading ${downloadUrl}....`);
    return new Promise(resolve => {
      const writeStream = fs.createWriteStream(executablePath);
      return request
        .get(downloadUrl)
        .pipe(unzipper.ParseOne(/\/(ffmpeg|ffmpeg.exe)$/))
        .pipe(writeStream)
        .on("close", () => {
          console.log(`${executablePath} download completed.`);
          resolve();
        });
    });
  }

  try {
    await fs.statAsync(executablePath);
    console.log(`Executable found at: ${executablePath}.`);
    return;
  } catch (error) {
    console.warn(`Problem accessing ffmpeg executive (${error.code}).`);
    await downloadFfmpeg();
    return fs.chmodAsync(executablePath, 700);
  }
}

module.exports = {
  init,
  convert
};
