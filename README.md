# YouTubeToArweave

A simple command line tool for uploading YouTube videos and playlists to the Arweave decentralized storage network.

## Installation

1. Clone the repository or download the source code.
2. Install dependencies using `npm install`.

## Setup

Before using YouTubeToArweave, you need to set up a .env file in the root directory of the project with the following fields:

```
NODE_ADDRESS=http://node1.bundlr.network
WALLET_FILE=$ARWEAVEWALLET
MAX_RETRIES=3
```

`NODE_ADDRESS`: The hostname or URL of an Arweave node, for example http://node1.bundlr.network.

`WALLET_FILE`: The path to your Arweave wallet file.

`MAX_RETRIES`: The maximum number of times to retry downloading any given video file from YouTube before giving up.

## Usage

To upload a single YouTube video to Arweave, run the following command:

```node index.js YouTubeToArweave <YouTube video URL>```

To upload an entire YouTube playlist to Arweave, run the following command:

```node index.js YouTubePlaylistToArweave <YouTube playlist URL>```

## How it Works

The YouTubeToArweave app works by first downloading the video assets (highest quality video and thumbnail) and metadata from YouTube using the provided video URL or playlist URL. It then tops up the user's Arweave node with the necessary amount of AR tokens to cover the storage and transaction costs, and finally uploads the video assets and metadata to the Arweave network. The uploaded content can be accessed using the Arweave gateway at [arweave.net](https://arweave.net).

## Credits

This app was created by Devon James and is licensed under the [GPL-3.0 License](https://www.gnu.org/licenses/gpl-3.0.html). It depends heavily on the libraries [play-dl](http://github.com/play-dl/play-dl) and [bundlr-network/client](https://github.com/Bundlr-Network/js-sdk)
