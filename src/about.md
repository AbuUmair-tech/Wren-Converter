---
layout: layouts/page.njk
title: About WrenConvert
permalink: /about/
description: "Why WrenConvert exists, who runs it, and the open-source software it is built on."
lede: "A file converter that does the work on your own device instead of sending your files to a server."
---
## Why I built it

Most online converters work the same way: you upload your file, it gets converted on someone else's server, and you download the result. That means waiting for the upload, size limits, daily caps, and a copy of your photo, spreadsheet or recording sitting on a computer you know nothing about.

Browsers today are fast enough to do the converting themselves. So every tool on WrenConvert runs as code inside the page, on your phone or computer. The file is read from your device, converted in that browser tab, and saved back to your device. Nothing is sent anywhere.

## Who runs it

I'm {{ site.author }}, a software developer. WrenConvert is a small independent project that I build and look after myself. There is no company, investor or data business behind it.

If something is wrong on the site, a conversion fails, or you want a format added, [email me]({{ "/contact/" }}).

## What it can do today

WrenConvert handles four families of files:

- **Images:** JPG, PNG, WebP, AVIF, HEIC from iPhones, GIF, TIFF, SVG, PSD, camera RAW and more, plus compressing and resizing
- **Spreadsheets:** Excel (XLSX, XLS, XLSM), CSV, TSV, OpenDocument and Apple Numbers, with PDF and HTML export
- **Fonts:** TTF, OTF, WOFF, WOFF2 and EOT
- **Audio:** MP3, WAV, M4A, AAC, FLAC, OGG, Opus and AIFF, and pulling the sound out of MP4, MOV, WebM and MKV videos

[How it works](/how-it-works/) explains what happens to a file, how each converter was tested, and the limits worth knowing about.

## Why a wren

The wren is one of the smallest birds around, and one of the busiest and loudest. Small, light and quick is what every tool here should be.

<h2 id="open-source-software">Open-source software</h2>

WrenConvert is built on open-source code. Each library is downloaded to your browser only when a converter needs it:

- [FFmpeg](https://ffmpeg.org/) via [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) for audio (GPL 2.0 or later; [source code](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10))
- [libheif](https://github.com/strukturag/libheif) via [heic-to](https://github.com/hoppergee/heic-to) for HEIC photos (LGPL 3.0)
- [SheetJS](https://sheetjs.com/) for spreadsheets (Apache 2.0)
- [jSquash](https://github.com/jamsinclair/jSquash) for AVIF and WebP (Apache 2.0)
- [Google woff2](https://github.com/google/woff2) via [fonteditor-core](https://github.com/kekee000/fonteditor-core) for fonts (MIT)
- [pdf-lib](https://pdf-lib.js.org/), [UTIF.js](https://github.com/photopea/UTIF.js), [ag-psd](https://github.com/Agamnentzar/ag-psd), [gifenc](https://github.com/mattdesl/gifenc), [pako](https://github.com/nodeca/pako) and [JSZip](https://stuk.github.io/jszip/) (MIT)
- [Inter](https://rsms.me/inter/) for the text you are reading (SIL Open Font License)

Thank you to everyone who maintains them.
