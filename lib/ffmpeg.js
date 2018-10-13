const request = require("request");
const Promise = require("bluebird");
const child_process = Promise.promisifyAll(require("child_process"));
const { spawn } = child_process;
const fs = Promise.promisifyAll(require("fs"));
const unzipper = require("unzipper");

const config = require("./config");
const seasonPicker = /S(\d{2})/;
const episodePicker = /E(\d{2})/;

async function buildFolderMap () {
  async function mapReducer (map, filename) {
    const isDirectory = (await fs.statAsync(`${config.destFolder}/${filename}`)).isDirectory();
    if (!isDirectory) {
      return map;
    }
    const unifiedName = filename.replace(/\s/g, "").toLowerCase();
    map[unifiedName] = filename;
    return map;
  }
  return await fs.readdirAsync(config.destFolder).reduce(mapReducer, {});
}

async function getOutputPath(filename) {
  let newFilename = config.renameRules
    .reduce((name, rule) => name.replace(rule.match, rule.replacement), filename)
    .split(".");
  newFilename.splice(-1, 0, "cutAds");
  newFilename = newFilename.join(".");
  const [ , numSeason ] = newFilename.match(seasonPicker);
  const TvSeriesName = newFilename.split(".S")[0].replace(/\./g, " ");
  const fullTargetPath = `${config.destFolder}/${TvSeriesName}/Season ${Number(numSeason)}/`;
  try {
    await fs.statAsync(fullTargetPath);
  } catch (error) {
    console.warn(`Problem accessing path: ${fullTargetPath}. Creating...`);
    await fs.mkdirAsync(fullTargetPath, { recursive: true });
  }
  return `${fullTargetPath}/${newFilename}`;
}

/**
 * Convert based on configs.
 */
async function convert(filePath) {
  const { executablePath } = config.ffmpeg;
  const { startAt, quality } = config.ffmpeg.args;
  const [ filename ] = filePath.split("/").slice(-1);
  const outputPath = await getOutputPath(filename);
  const shouldSkipConverting = config.skipConvertingPatterns.some(pattern => filename.includes(pattern));

  if (shouldSkipConverting) {
    // No need to convert, just move to dest folder.
    await fs.copyFileAsync(filePath, newPath);
    console.log(`Moved file: ${outputPath}`);
    return;
  } else {
    // Need to convert. So start converting.
    console.log(`Converting: ${filename}`);
    await new Promise(resolve => {
      const conversionProcess = spawn(executablePath, ["-ss", startAt, "-i", `"${filePath}"`, quality, "-y", `"${outputPath}"`], { shell: true });
      conversionProcess.stdout.on("data", data => console.log(data.toString("utf-8")));
      conversionProcess.stderr.on("data", data => console.log(data.toString("utf-8")));
      conversionProcess.on("close", resolve);
    });
    console.log(`${filename} converted.`);
  }
  
  return await fs.unlinkAsync(filePath);
}

/**
 * Check if ffmpeg binary file exists. If not, download it.
 */
async function init () {
  async function downloadFfmpeg () {
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
  const { executablePath } = config.ffmpeg;
  try {
    await fs.statAsync(executablePath);
    console.log(`Executable found at: ${executablePath}.`);
    return;
  } catch (error) {
    console.warn(`Problem accessing ffmpeg executive (${error.code}).`);
    await downloadFfmpeg();
    return await fs.chmodAsync(executablePath, 700);
  }
}

module.exports = {
  init,
  convert
};