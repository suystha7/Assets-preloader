class AssetPreloader {
  constructor(maxConcurrent = { high: 3, medium: 2, low: 1 }) {
    this.assets = new Map();
    this.eventListeners = {};
    this.stats = {
      total: 0,
      loaded: 0,
      failed: 0,
      remaining: 0,
      high: { total: 0, done: 0 },
      medium: { total: 0, done: 0 },
      low: { total: 0, done: 0 },
    };
    this.loadedAssets = new Set();
    this.failedAssets = new Set();
    this.queue = { high: [], medium: [], low: [] };
    this.concurrent = { high: 0, medium: 0, low: 0 };
    this.maxConcurrent = maxConcurrent;
    this.paused = false;
    this.etaSamples = [];
    this.running = false;
  }

  on(event, cb) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(cb);
  }

  emit(event, ...args) {
    (this.eventListeners[event] || []).forEach((cb) => cb(...args));
  }

  add(asset) {
    asset.timeout = asset.timeout || 3000;
    asset.retries = asset.retries ?? 1;
    asset.priority = asset.priority || "medium";
    asset.dependsOn = asset.dependsOn || [];
    this.assets.set(asset.id, asset);
    this.queue[asset.priority].push(asset);
    this.stats.total++;
    this.stats.remaining++;
    this.stats[asset.priority].total++;
  }

  async load() {
    if (this.running) return;
    this.startTime = Date.now();
    this.emit("start");
    this.running = true;
    this._processQueue();
  }

  _processQueue() {
    if (this.paused || !this.running) return;

    ["high", "medium", "low"].forEach((priority) => {
      while (
        this.concurrent[priority] < this.maxConcurrent[priority] &&
        this.queue[priority].length
      ) {
        const asset = this.queue[priority].shift();
        const dependenciesResolved = asset.dependsOn.every(
          (dep) => this.loadedAssets.has(dep) || this.failedAssets.has(dep)
        );
        if (dependenciesResolved) {
          this.concurrent[priority]++;
          this._attemptLoad(asset).finally(() => {
            this.concurrent[priority]--;
            this._processQueue();
          });
        } else {
          this.queue[priority].push(asset);
          break;
        }
      }
    });

    if (this.stats.loaded + this.stats.failed >= this.stats.total) {
      this.running = false;
      const durationMs = Date.now() - this.startTime;
      this.emit("complete", {
        success: Array.from(this.loadedAssets),
        failed: Array.from(this.failedAssets),
        durationMs,
      });
    }
  }

  async _attemptLoad(asset) {
    const start = Date.now();

    for (let attempt = 1; attempt <= asset.retries + 1; attempt++) {
      try {
        await this._realLoad(asset);
        const duration = Date.now() - start;
        this.etaSamples.push(duration);
        this.loadedAssets.add(asset.id);
        this.stats.loaded++;
        this.stats.remaining--;
        this.stats[asset.priority].done++;
        this._reportProgress(asset.id);
        this.emit("load", asset);
        return;
      } catch (error) {
        if (attempt <= asset.retries) {
          this.emit("retry", asset, attempt);
          await this._delay(500 * Math.pow(2, attempt - 1));
        } else {
          this.failedAssets.add(asset.id);
          this.stats.failed++;
          this.stats.remaining--;
          this._reportProgress(asset.id);
          this.emit("error", asset, error);
        }
      }
    }
  }

  _realLoad(asset) {
    const { type, url, timeout } = asset;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let loader;
    switch (type) {
      case "json":
        loader = fetch(url, { signal: controller.signal }).then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        });
        break;
      case "text":
        loader = fetch(url, { signal: controller.signal }).then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        });
        break;
      case "image":
        loader = new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Image failed to load"));
          img.src = url;
        });
        break;
      case "script":
        loader = new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = url;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Script failed to load"));
          document.body.appendChild(script);
        });
        break;
      default:
        return Promise.reject(new Error(`Unsupported type: ${type}`));
    }

    return loader.finally(() => clearTimeout(timeoutId));
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _reportProgress(currentId) {
    const percentage = Math.round(
      ((this.stats.loaded + this.stats.failed) / this.stats.total) * 100
    );
    const avgTime = this.etaSamples.length
      ? Math.round(
          this.etaSamples.reduce((a, b) => a + b) / this.etaSamples.length
        )
      : 0;
    const eta = avgTime * this.stats.remaining;

    this.emit("progress", {
      total: this.stats.total,
      loaded: this.stats.loaded,
      failed: this.stats.failed,
      remaining: this.stats.remaining,
      percentage,
      current: currentId,
      etaMs: eta,
      high: this.stats.high,
      medium: this.stats.medium,
      low: this.stats.low,
    });
  }

  pause() {
    this.paused = true;
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this._processQueue();
  }
}

const startBtn = document.getElementById("startBtn");
const logElem = document.getElementById("log");
const progressBar = document.getElementById("progressBar");
const reportElem = document.getElementById("report");
const reportStatus = document.getElementById("report-status");
const reportSuccessCount = document.getElementById("report-success-count");
const reportFailedCount = document.getElementById("report-failed-count");
const reportSuccessList = document.getElementById("report-success-list");
const reportFailedList = document.getElementById("report-failed-list");
const reportDuration = document.getElementById("report-duration");


function log(msg, type = "info") {
  const div = document.createElement("div");
  div.textContent = msg;
  if (type === "success") div.classList.add("log-success");
  else if (type === "fail") div.classList.add("log-fail");
  else if (type === "retry") div.classList.add("log-retry");
  logElem.appendChild(div);
  logElem.scrollTop = logElem.scrollHeight;

  const maxHeight = 300;
  const scrollHeight = logElem.scrollHeight;
  if (scrollHeight > logElem.clientHeight && scrollHeight <= maxHeight) {
    logElem.style.height = `${scrollHeight}px`;
  }
}

function clearLog() {
  logElem.textContent = "";
}

function clearReport() {
  reportSuccessList.innerHTML = "";
  reportFailedList.innerHTML = "";
  reportSuccessCount.textContent = "0";
  reportFailedCount.textContent = "0";
  reportDuration.textContent = "";
  reportStatus.textContent = "";
  reportElem.style.display = "none";
}

function resetUI() {
  clearLog();
  progressBar.style.width = "0%";
  progressBar.textContent = "Progress: 0%";
  clearReport();
}

function setupPreloader() {
  preloader = new AssetPreloader();

  preloader.on("start", () => {
    clearReport();
    log("Preloading started...");
  });

  preloader.on("load", (asset) => log(`Loaded: ${asset.id}`, "success"));
  preloader.on("error", (asset, err) =>
    log(`Failed: ${asset.id} (${err.message})`, "fail")
  );
  preloader.on("retry", (asset, attempt) =>
    log(`Retrying ${asset.id} (Attempt ${attempt})`, "retry")
  );
  preloader.on("progress", (stats) => {
    const etaSeconds = isFinite(stats.etaMs)
      ? Math.round(stats.etaMs / 1000)
      : null;

    let etaFormatted = "--:--";
    if (etaSeconds !== null) {
      const mins = Math.floor(etaSeconds / 60);
      const secs = etaSeconds % 60;
      etaFormatted = `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    progressBar.style.width = `${stats.percentage}%`;
    progressBar.textContent = `Progress: ${stats.percentage}% (${stats.loaded}/${stats.total})`;
  });

  preloader.on("complete", (report) => {
    reportElem.style.display = "block";
    reportStatus.textContent = "Complete";
    reportSuccessCount.textContent = report.success.length;
    reportFailedCount.textContent = report.failed.length;

    reportSuccessList.innerHTML = "";
    report.success.forEach((id) => {
      const li = document.createElement("li");
      li.textContent = id;
      reportSuccessList.appendChild(li);
    });

    reportFailedList.innerHTML = "";
    report.failed.forEach((id) => {
      const li = document.createElement("li");
      li.textContent = id;
      reportFailedList.appendChild(li);
    });

    reportDuration.textContent = report.durationMs;
  });
}

function startPreloading() {
  resetUI();
  setupPreloader();

  preloader.add({
    id: "config",
    type: "json",
    url: "/assets/config.json",
    priority: "high",
    timeout: 5000,
    retries: 2,
  });
  preloader.add({
    id: "logo",
    type: "image",
    url: "/assets/logo.png",
    priority: "high",
  });
  preloader.add({
    id: "app-bundle",
    type: "script",
    url: "/js/app.js",
    priority: "high",
    dependsOn: ["config"],
  });
  preloader.add({
    id: "theme",
    type: "json",
    url: "/assets/theme.json",
    priority: "medium",
    retries: 1,
  });
  preloader.add({
    id: "terms",
    type: "text",
    url: "/assets/terms.txt",
    priority: "low",
  });

  for (let i = 0; i < 20; i++) {
    preloader.add({
      id: `img-${i}`,
      type: "image",
      url: `/assets/img-${i}.jpg`,
      priority: "low",
    });
  }

  preloader.load();
}

startBtn.addEventListener("click", startPreloading);
