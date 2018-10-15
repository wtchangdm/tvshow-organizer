const Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));
const ffmpeg = require("./lib/ffmpeg");
const config = require("./lib/config");

let convertingQueue = Promise.resolve();
const UNFINISHED_FILE_EXT = "!qB";

async function startConverting() {
  async function enqueue(filepath) {
    try {
      await fs.statAsync(filepath);
      console.log(`Enqueueing ${filepath}...`);
      convertingQueue = convertingQueue
        .then(() => ffmpeg.convert(filepath))
        .catch(console.error);
    } catch (error) {
      console.log(`File ${filepath} has been deleted.`);
    }
    // Specifically avoid to wait promise to finished.
  }

  async function monitorAndEnqueue(folderPath) {
    function changeHandler(eventType, filename) {
      if (!filename || filename.endsWith(UNFINISHED_FILE_EXT)) return;
      console.log(`Event ${eventType} detected: ${filename}.`);
      enqueue(`${folderPath}/${filename}`);
    }

    await fs.readdirAsync(folderPath)
      .call("filter", filename => !filename.endsWith(UNFINISHED_FILE_EXT))
      .map(filename => enqueue(`${folderPath}/${filename}`));
    fs.watch(folderPath, changeHandler);
  }

  await ffmpeg.init();
  await Promise.map(config.srcFolders, monitorAndEnqueue);
}

startConverting();
