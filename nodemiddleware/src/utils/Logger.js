class Logger {
  constructor(moduleName = 'MYLAPS') {
    this.moduleName = moduleName;
  }

  info(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp}: ℹ️  [${this.moduleName}] ${message}`);
    if (data) {
      console.log(data);
    }
  }

  success(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp}: ✅ [${this.moduleName}] ${message}`);
    if (data) {
      console.log(data);
    }
  }

  warning(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp}: ⚠️  [${this.moduleName}] ${message}`);
    if (data) {
      console.log(data);
    }
  }

  error(message, error = null) {
    const timestamp = new Date().toISOString();
    console.error(`${timestamp}: ❌ [${this.moduleName}] ${message}`);
    if (error) {
      console.error(error);
    }
  }

  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      const timestamp = new Date().toISOString();
      console.log(`${timestamp}: 🐛 [${this.moduleName}] ${message}`);
      if (data) {
        console.log(data);
      }
    }
  }

  stream(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp}: 🌊 [${this.moduleName}] ${message}`);
  }

  position(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp}: 📍 [${this.moduleName}] ${message}`);
  }

  lap(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp}: 🏁 [${this.moduleName}] ${message}`);
  }

  leaderboard(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp}: 🏆 [${this.moduleName}] ${message}`);
  }

  startup(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp}: 🚀 [${this.moduleName}] ${message}`);
  }

  shutdown(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp}: 🔄 [${this.moduleName}] ${message}`);
  }
}

module.exports = Logger;
