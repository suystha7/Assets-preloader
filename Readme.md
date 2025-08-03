# 🚀 Asset Preloader

A lightweight JavaScript asset preloader that handles images, scripts, JSON, and text files — complete with retry logic, dependencies, estimated time remaining (ETA), concurrent loading per priority level, and a progress/reporting UI.

## Features

- **Priority Queuing**: Load assets with `high`, `medium`, or `low` priority.
- **Max Concurrent Loads**: Set how many assets can load in parallel per priority.
- **Dependency Resolution**: Assets can wait until their dependencies are successfully loaded or failed.
- **Retry Mechanism**: Failed assets retry with exponential backoff.
- **Progress UI**:
  - Text log output
  - Progress bar
  - Percentage and counts
  - ETA in mm:ss format
- **Asset Type Support**:
  - JSON
  - Text
  - Images
  - JavaScript scripts
- **ETA Calculation**: Dynamically calculated using average load times.
- **Load Summary Report**: Lists successful and failed assets after completion.
- **Event-Driven API**: Hooks for `start`, `progress`, `load`, `error`, `retry`, and `complete`.

---

## Known Limitations
- Audio/Video not supported
- No cancel/abort UI per asset
- Script assets are not sandboxed — they are directly appended to <body>
- ETA may fluctuate due to outliers in asset load duration

---

## How to Run / Test Locally

Since the project uses `fetch()`, you need to run it on a local web server. Opening `index.html` directly in the browser will NOT work.

### Steps:

1. **Download or clone the project files** to your computer.
   git clone https://github.com/suystha7/assets-preloader.git
   cd asset-preloader

2. **Using VS Code Live Server**

- Open the project folder in VS Code.
- Install the _Live Server_ extension if you don’t have it.
- Right-click `index.html` → Click **Open with Live Server**.

3. **Open the page** in your browser (the server URL from above).

4. **Click the “Start Preloading” button** on the page.

5. Watch the **progress bar, ETA**, and **logs** update as assets load.

---

## How to Add a New Asset

Add assets before calling `load()`. Example:

```js
preloader.add({
    id: "myImage",
    type: "image",
    url: "/assets/my-image.png",
    priority: "medium",
    timeout: 4000,
    retries: 2,
    dependsOn: ["config"]
});

Then call:
preloader.load();

---