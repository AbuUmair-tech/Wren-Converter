---
layout: layouts/page.njk
title: How WrenConvert works
permalink: /how-it-works/
schemaType: article
description: "How WrenConvert converts files inside your browser without uploading them, how each converter was tested, and the limits to know about."
lede: "What happens to a file when you convert it here, how you can check it yourself, and where the limits are."
---
## The short answer

WrenConvert converts files **inside your web browser**. When you choose a file, your browser reads it from your device, the converter code in the page turns it into the new format, and the result is offered back to you as a download. At no point is the file sent over the internet.

## Step by step

1. **You open a converter page.** Your browser downloads the page and its code, the same as any website.
2. **You add a file.** The browser gives the page access to that one file, on your device. Nothing is sent.
3. **You press Convert.** The page loads the converter for that format (for example, the HEIC decoder for iPhone photos) and runs it on your device's processor.
4. **You download the result.** The new file is created in your browser's memory and saved to your device when you click Download.

Your original file is never changed.

## How to check that nothing is uploaded

You don't have to take my word for it:

- **Offline test:** open a converter, switch off Wi-Fi and mobile data, then convert a file. It still works.
- **Developer tools:** in Chrome, Edge or Firefox, press F12, open the *Network* tab and convert a file. You will see the converter code being downloaded, but no request that sends your file anywhere.

## What runs where

| Files | Converter | Notes |
|---|---|---|
| JPG, PNG, WebP, GIF, BMP | Your browser's own image engine | Fastest; nothing extra to download |
| HEIC and HEIF | libheif, compiled to WebAssembly | About 3 MB, downloaded the first time you need it |
| AVIF and WebP output | jSquash (libavif and libwebp) | Used when the browser cannot save the format itself |
| TIFF, PSD, TGA, camera RAW | UTIF.js, ag-psd and WrenConvert's own readers | RAW files use the full-size preview the camera stores inside them |
| Excel, CSV, ODS, Numbers | SheetJS | About 1.3 MB |
| Fonts | WrenConvert's own font packer and Google's WOFF2 codec | Lossless except CFF to TrueType outlines |
| Audio | FFmpeg, compiled to WebAssembly | About 31 MB, downloaded once and then kept by your browser |

## How the converters were tested

Before the converters went live, sample files were converted to every output format, and the results were opened again with independent software rather than trusted blindly:

- **Images:** sample files in 20 formats were converted to every output format (276 conversions), and each result was checked for the right size, colours and transparency. Results were opened with separate tools (Pillow and sharp), and phone photos stored sideways came out the right way up.
- **Spreadsheets:** workbooks with several sheets, formulas, dates, merged cells, IDs with leading zeros, accented letters, Urdu and Chinese text were converted to every format, including files made by other programs and Apple Numbers.
- **Fonts:** real fonts, including Lato, Noto Nastaliq Urdu and a PostScript-outline OpenType font, were converted to every format. Text set in the original and the converted font was measured to be exactly the same width, which shows kerning and ligatures survived.
- **Audio:** test tones, real recordings and video files were converted to every format and played back with the browser's own decoder to check the length and pitch. Song titles, artists and album art were checked too.

Bugs found during testing were fixed before the converters went live. If you find one that slipped through, please [tell me](/contact/).

## Limits worth knowing

- **Memory.** Your device does the work, so very large files need enough free memory. Audio and video files up to about 1.5 GB work on most computers; phones handle less.
- **First use of a converter.** The heavier converters (HEIC, spreadsheets, audio) download once, the first time you use them. After that they load from your browser's cache.
- **Browsers.** The site is built for current versions of Chrome, Edge, Firefox and Safari. Very old browsers may not support everything.
- **Quality.** Converting to a smaller, compressed format (JPG, MP3, WebP) always discards some detail, and converting back to a lossless format does not bring it back. Each converter page explains what is kept and what is not.
