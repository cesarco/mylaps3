/**
 * LoggerUtils.js
 * Utilidades de logging reutilizables
 */

class LoggerUtils {
  /**
   * Log helper que maneja tanto custom loggers como console
   * @param {Object} logger - El logger (custom o console)
   * @param {string} level - Nivel del log (info, error, warn, debug)
   * @param {string} message - Mensaje principal
   * @param {...any} args - Argumentos adicionales
   */
  static log(logger, level, message, ...args) {
    if (logger && typeof logger[level] === 'function') {
      logger[level](message, ...args);
    } else {
      console[level](message, ...args);
    }
  }

  /**
   * Wrapper específico para info logs
   */
  static info(logger, message, ...args) {
    this.log(logger, 'info', message, ...args);
  }

  /**
   * Wrapper específico para error logs
   */
  static error(logger, message, ...args) {
    this.log(logger, 'error', message, ...args);
  }

  /**
   * Wrapper específico para warn logs
   */
  static warn(logger, message, ...args) {
    this.log(logger, 'warn', message, ...args);
  }

  /**
   * Wrapper específico para debug logs
   */
  static debug(logger, message, ...args) {
    this.log(logger, 'debug', message, ...args);
  }
}

module.exports = LoggerUtils;
