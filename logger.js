const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

function logGreen(message) {
  console.log(`${GREEN}${message}${RESET}`);
}

class Logger {
  constructor() {
    this.bumpCount = 0;
    this.processName = "autobump";
    this.padding = 15;
  }

  _formatLeftSide() {
    const paddedProcess = this.processName.padEnd(this.padding);
    return `${GREEN}${this.bumpCount}|${paddedProcess}|${RESET}`;
  }

  _formatLog(tag, level, message) {
    return `${this._formatLeftSide()} [${tag}] [${level}]: ${message}`;
  }

  simple(message) {
    console.log(`${this._formatLeftSide()} ${message}`);
  }

  lolzInfo(message) {
    console.log(this._formatLog("LOLZ", "INFO", message));
  }

  lolzError(message) {
    console.log(this._formatLog("LOLZ", "ERROR", message));
  }

  lolzWarn(message) {
    console.log(this._formatLog("LOLZ", "WARN", message));
  }

  telgInfo(message) {
    console.log(this._formatLog("TELG", "INFO", message));
  }

  telgError(message) {
    console.log(this._formatLog("TELG", "ERROR", message));
  }

  telgWarn(message) {
    console.log(this._formatLog("TELG", "WARN", message));
  }

  sysInfo(message) {
    console.log(this._formatLog("SYST", "INFO", message));
  }

  incrementBumpCount() {
    this.bumpCount++;
  }

  getBumpCount() {
    return this.bumpCount;
  }

  resetBumpCount() {
    this.bumpCount = 0;
  }
}

const loggerInstance = new Logger();
loggerInstance.logGreen = logGreen;

module.exports = loggerInstance;
