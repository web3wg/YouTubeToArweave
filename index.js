const axios = require('axios');
const Bundlr = require('@bundlr-network/client');
const fs = require('fs');
const path = require('path');
const playdl = require('play-dl');
const { video_info } = require('play-dl');
const ProgressBar = require('progress');
require('dotenv').config();

if (!fs.existsSync('.env')) {
  console.error('Error: .env file not found');
  process.exit(1);
}

const privateKey = process.env.WALLET_FILE
const jwk = JSON.parse(fs.readFileSync(privateKey).toString());
const bundlr = new Bundlr.default("http://node1.bundlr.network", "arweave", jwk);
const maxRetries = process.env.MAX_RETRIES;

async function getNodeBalance() {
  const atomicBalance = await bundlr.getLoadedBalance();
  const convertedBalance = bundlr.utils.unitConverter(atomicBalance);
  const nodeBalance = {atomicBalance, convertedBalance}
  return nodeBalance;
}

async function getArweavePrice(){
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=arweave&vs_currencies=usd';
  const response = await axios.get(url);
  const arweaveUsd = response.data.arweave.usd;
  // console.log(`Arweave price = $${price}`);
  return arweaveUsd;
}

async function getUploadPrice(fileSize){
  const priceOfFileAtomic = await bundlr.getPrice(fileSize);
  const priceOfFileConverted = bundlr.utils.unitConverter(priceOfFileAtomic);
  dataSizeInMB = (fileSize / 1048576).toFixed(3)
  const uploadPrice = {priceOfFileAtomic, priceOfFileConverted}
  return uploadPrice;
}

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

async function uploadFile(filename, tags) {
  try {
    const filepath = 'files/'+filename;
    const file = fs.readFileSync(filepath)
    const tx = await bundlr.upload(file, {tags})
    return tx.id;
  }
  catch (error) {
    console.error('Error:', error);
  }
}

async function uploadFolder(id, video) {
  try {
    const folder = "files/" + id + "/";
    const files = fs.readdirSync(folder);
    const filenames = [];
    const paths = [];
    const thumbnailFilename = []
    const videoFilename = []
    const metadataFilename = []
    for (const file of files) {
      const extension = path.extname(file);  
      const contentType =
        extension === ".json"
          ? "application/json"
          : extension === ".jpg" || extension === ".webp"
          ? `image/${extension.split(".")[1]}`
          : `video/${extension.split(".")[1]}`;
      const tags = [
        { name: "Content-Type", value: contentType },
        { name: "AppName", value: "YouTubeToArweave" },
      ];
      if (file != ".DS_Store") {
        const txid = await uploadFile(id + "/" + file, tags);
      const filepath = `\n"${file}":{"id": "${txid}"}`;
      if (extension === ".jpg" || extension === ".webp") {
        thumbnailFilename.push(file);
      } else if (extension === ".mp4" || extension === ".webm") {
        videoFilename.push(file);
      } else if (extension === ".json") {
        metadataFilename.push(file);
      }
      paths.push(filepath);
      filenames.push(file);
      }
    }
    const data = 
`{
"manifest": "arweave/paths",
"version": "0.1.0",
"paths": {${paths}
}
}`;
    const manifestjson = `${id}-manifest.json`;
    const writeFilePromise = new Promise((resolve, reject) => {
      fs.writeFile("files/" + manifestjson, data, function (err) {
        if (err) reject(err);
        resolve();
      });
    });

    await writeFilePromise;

    const tags = [
      { name: "Content-Type", value: "application/x.arweave-manifest+json" },
      { name: "AppName", value: "YouTubeToArweave" },
      { name: "Video-Title", value: video.video_details.title },
      { name: "Video-Creator", value: video.video_details.channel.name},
      { name: "Video-Tags", value: JSON.stringify(video.video_details.tags) },
      { name: "Video-Filename", value: videoFilename[0] },
      { name: "Video-Thumbnail", value: thumbnailFilename[0] },
      { name: "Video-Metadata", value: metadataFilename[0] },
    ];
    const tagsSize = Buffer.byteLength(JSON.stringify(tags));
    const tagDataRemaining = 4096 - (tagsSize + Buffer.byteLength(JSON.stringify({ name: "Video-Description", value: "" })));
    const descriptionTruncated = video.video_details.description.substring(0, tagDataRemaining);
    tags.push({ name: "Video-Description", value: descriptionTruncated });
    const newTagsSize = Buffer.byteLength(JSON.stringify(tags));
    console.log(`Tags size: ${newTagsSize} bytes`)
    const manifesttxid = await uploadFile(manifestjson, tags);
    const result = { manifesttxid, filenames };
    return result;
  } catch (error) {
    console.log("Error uploading file ", error);
  }
}

async function topUpNode(videos){
  nodeBalance = await getNodeBalance();
  atomicBalance = nodeBalance.atomicBalance;
  let totalSize = 0;
  videos.forEach(video => {
    dir = 'files/'+video.id;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = dir + '/' + file;
      const fileSize = getFileSize(filePath);
      totalSize += fileSize;
    }    
  })
  if (totalSize >= 0 && totalSize < 1024){
    console.log(`Total size of all videos: ${totalSize} bytes`)
  } else if (totalSize >= 1024 && totalSize < 1048576){
    const totalSizeKb = totalSize/1024;
    console.log(`Total size of all videos: ${totalSizeKb.toFixed(3)} kilobytes`)
  } else if (totalSize >= 1048576 && totalSize < 1073741824){
    const totalSizeMb = totalSize/1048576;
    console.log(`Total size of all videos: ${totalSizeMb.toFixed(3)} megabytes`)
  } else if (totalSize >= 1073741824 && totalSize < 1099511627776){
    const totalSizeGb = totalSize/1073741824;
    console.log(`Total size of all videos: ${totalSizeGb.toFixed(3)} gigabytes`)
  } else if (totalSize >= 1099511627776 && totalSize < 1125899906842624){
    const totalSizeTb = totalSize/1099511627776;
    console.log(`Total size of all videos: ${totalSizeTb.toFixed(3)} terabytes`)
  }
  const priceOfFile = await getUploadPrice(totalSize);
  priceOfFileAtomic = priceOfFile.priceOfFileAtomic;

  console.log((`uploadPrice: ${(priceOfFileAtomic/1e12).toFixed(4)} AR`), (`\nnodeBalance: ${(atomicBalance/1e12).toFixed(4)} AR`))
  const topUpAmount = priceOfFileAtomic - atomicBalance;
  if (topUpAmount > 0){
    const topUpAmount = priceOfFileAtomic - atomicBalance;
    console.log(`Top up node by ${topUpAmount} winstons`);
    const response = await bundlr.fund(topUpAmount);
    console.log("Funding TX: ", response.id, "Amount:", response.quantity);
    while (atomicBalance < priceOfFileAtomic){
      nodeBalance = await getNodeBalance();
      atomicBalance = nodeBalance.atomicBalance;
      console.log("Node balance is insufficient, checking again in 30 seconds...");
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    console.log("Node balance is sufficient");
  } else {
    console.log("Node balance is sufficient");
  }
}

async function getVideoInfo(url) {
  try {
    const video = await playdl.video_info(url);
    return video;
  }
  catch (error) {
    console.log("Error getting video info ", error);
  }
}

async function getPlaylistVideos(url) {
  try {
    const playlist = await playdl.playlist_info(url);
    const playlistTitle = playlist.title;
    const playlistVideoCount = playlist.videoCount;
    const playlistVideos = [];
    const videos = []
    for (const video of playlist.videos) {
      const videoData = '-' + video.id + ' ' + video.title
      playlistVideos.push(videoData);
      const id = video.id;
      videos.push({id});
    }
    console.log({playlistTitle, playlistVideoCount, playlistVideos})
    return videos;
  } catch (error) {
    console.error("Error fetching playlist:", error);
  }
}   

async function makeVideoDirectory(youTubeID){
  const dir = 'files/'+youTubeID;
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }
  resolve = true;
}

async function retryDownloadVideoThumbnail(thumbnailUrl, thumbnailPath, maxRetries) {
  let retries = 0;
  while (retries < maxRetries) {
      const thumbnail = await downloadVideoThumbnail(thumbnailUrl, thumbnailPath);
      if (typeof thumbnail === "string" && thumbnail.startsWith("Error")) {
        console.log("Error downloading thumbnail:", thumbnail);
        console.log("Retrying download...");
        retries++;
        continue;
      }
      return thumbnail;
  }
  console.log("Max retries exceeded");
  return null;
}

async function retryDownloadVideo(info, format, outputPath, maxRetries) {
  let retries = 0;
  while (retries < maxRetries) {
      const video = await downloadVideo(info, format, outputPath);
      if (typeof video === "string" && video.startsWith("Error")) {
        console.log("Error downloading video:", video);
        console.log("Retrying download...");
        retries++;
        continue;
      }
      return video;
  }
  console.log("Max retries exceeded");
  return null;
}

async function downloadVideoThumbnail(thumbnailUrl, thumbnailPath) {
  try{
    if (fs.existsSync(thumbnailPath)) {
      console.log("Thumbnail already exists:", thumbnailPath);
      return thumbnailPath;
    } else {
      console.log('Downloading thumbnail   :', thumbnailPath);
      const response = await axios({
        method: 'get',
        url: thumbnailUrl,
        responseType: 'stream',
      });
      return new Promise((resolve, reject) => {
        const totalBytes = parseInt(response.headers['content-length'], 10);
        const progressBar = new ProgressBar('Downloading [:bar] :percent :etas', {
          complete: '=',
          incomplete: ' ',
          width: 11,
          total: totalBytes,
        });
        response.data
        .on('data', (chunk) => {
          progressBar.tick(chunk.length);
        })
        .pipe(fs.createWriteStream(thumbnailPath))
        .on('finish', () => {
          console.log('Download complete       :', thumbnailPath);
          resolve(thumbnailPath);
        })
        .on('error', (e) => {
          reject(e);
        });
        });
    }
  } catch (error) {
    console.error("Error in thumbnail download:", error.code);
    return `Error: ${error.code}`;
  }
}

async function downloadVideo(info, format, outputPath) {
  try {
    const quality = format.quality;
    const response = await axios({
      method: "get",
      url: format.url,
      responseType: "stream",
    });
    const mimeTypeParts = format.mimeType.split(";")[0].split("/");
    const fileExtension = mimeTypeParts[1];
    const qualityLabel = format.qualityLabel;
    const fileSize = parseInt(format.contentLength);
    const filename = quality + "_" + qualityLabel + "." + fileExtension;

    if (fs.existsSync(outputPath + "/" + filename)) {
      console.log("File already exists     :", outputPath + "/" + filename);
      const existingFileSize = fs.statSync(outputPath + "/" + filename).size;
      console.log("Expected file size      :", fileSize);
      console.log("Existing file size      :", existingFileSize);
      if (existingFileSize === fileSize) {
        return ("Download complete")
      } else {
        console.log("File incomplete, replacing it...");
      }
    }
      console.log("Downloading file        :", outputPath + "/" + filename);
      return new Promise((resolve, reject) => {
        const totalBytes = parseInt(response.headers["content-length"], 10);
        const progressBar = new ProgressBar(
          "Downloading [:bar] :percent :etas",
          {
            complete: "=",
            incomplete: " ",
            width: 11,
            total: totalBytes,
          }
        );
        response.data
          .on("data", (chunk) => {
            progressBar.tick(chunk.length);
          })
          .pipe(fs.createWriteStream(outputPath + "/" + filename))
          .on("finish", () => {
            console.log("Download complete       :", filename);
            resolve(video);
          })
          .on("error", (e) => {
            reject(e);
          });
      });
  } catch (error) {
    console.error("Error in downloadVideo  :", error.code);
    return `Error: ${error.code}`
  }
}

async function downloadVideoAssetsAndMetadata(videos){
  if (!fs.existsSync("files")){
    fs.mkdirSync("files");
  }
  const promises = [];
  for (const video of videos) {
    const youTubeID = video.id;
    const videoPromises = [];
    videoPromises.push(await makeVideoDirectory(youTubeID));
    const info = await video_info("https://www.youtube.com/watch?v=" + youTubeID);
    const thumbnail = info.video_details.thumbnails.sort((a, b) => b.width - a.width)[0];
    const thumbnailUrl = thumbnail.url;
    const thumbnailPath = "files/" + youTubeID + thumbnailUrl.split(youTubeID)[1].split("?")[0];
    videoPromises.push(await retryDownloadVideoThumbnail(thumbnailUrl, thumbnailPath, maxRetries));
    const format = info.format.filter((format) => format.mimeType.startsWith("video/")).sort(
      (a, b) => b.bitrate - a.bitrate // highest quality
      // (b, a) => b.bitrate - a.bitrate // lowest quality
    )[0];
    const outputPath = "files/" + youTubeID;
    const metadata = {
      title: info.video_details.title,
      description: info.video_details.description,
      tags: info.video_details.tags,
      durationInSec: info.video_details.durationInSec,
      uploadedAt: info.video_details.uploadedAt,
      youTubeChannel: info.video_details.channel.id,
    }
    const videoMetadata = JSON.stringify(metadata);
    fs.writeFileSync("files/" + youTubeID + '/metadata.json', videoMetadata);
    videoPromises.push(await retryDownloadVideo(info, format, outputPath, maxRetries));
    promises.push(...videoPromises);
  }
  await Promise.all(promises);
  console.log("Video assets & metadata downloaded.");
}

const args = process.argv.slice(2);

if (args.length === 2 && args[0] === "YouTubeToArweave") {
  const youTubeID = args[1];
  getVideoInfo(youTubeID).then((video) => {
    const videos = [];
    const id = video.video_details.id;
    videos.push({ id });
    downloadVideoAssetsAndMetadata(videos).then((ignore) => {
      topUpNode(videos).then((ignore) => {
        uploadFolder(id, video).then((result) => {
          console.log("video assets and metadata uploaded to arweave. manifest txid: ", result.manifesttxid);
        });
      });
    });
  });
} else if (args.length === 2 && args[0] === "YouTubePlaylistToArweave") {
  const playlistURL = args[1];
  getPlaylistVideos(playlistURL).then((videos) => {
    downloadVideoAssetsAndMetadata(videos).then((video) => {
      topUpNode(videos).then((ignore) => {
        videos.forEach((video) => {
          uploadFolder(video.id, video).then((result) => {
            console.log("video assets and metadata uploaded to arweave. manifest txid: ", result.manifesttxid);
          });
        });
      });
    });
  });
} else {
  console.error("Invalid command. Usage: node index.js <command> <options>");
}