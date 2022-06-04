import { version } from "./_version.js";
export var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARNING"] = "WARNING";
    LogLevel["ERROR"] = "ERROR";
    LogLevel["OFF"] = "OFF";
})(LogLevel || (LogLevel = {}));
;
const LogLevels = { debug: 1, "default": 2, info: 2, warning: 3, error: 4, off: 5 };
let _logLevel = LogLevels["default"];
let _globalLogger = null;
const _normalizeForms = ["NFD", "NFC", "NFKD", "NFKC"].reduce((accum, form) => {
    try {
        if ("test".normalize(form) !== "test") {
            throw new Error("bad");
        }
        ;
        if (form === "NFD") {
            const check = String.fromCharCode(0xe9).normalize("NFD");
            const expected = String.fromCharCode(0x65, 0x0301);
            if (check !== expected) {
                throw new Error("broken");
            }
        }
        accum.push(form);
    }
    catch (error) { }
    return accum;
}, []);
function defineReadOnly(object, name, value) {
    Object.defineProperty(object, name, {
        enumerable: true, writable: false, value,
    });
}
const maxValue = 0x1fffffffffffff;
const ErrorConstructors = {};
ErrorConstructors.INVALID_ARGUMENT = TypeError;
ErrorConstructors.NUMERIC_FAULT = RangeError;
ErrorConstructors.BUFFER_OVERRUN = RangeError;
export class Logger {
    version;
    static LogLevels = LogLevel;
    constructor(version) {
        defineReadOnly(this, "version", version || "_");
    }
    makeError(message, code, info) {
        {
            const details = [];
            if (info) {
                for (const key in info) {
                    const value = (info[key]);
                    try {
                        details.push(key + "=" + JSON.stringify(value));
                    }
                    catch (error) {
                        details.push(key + "=[could not serialize object]");
                    }
                }
            }
            details.push(`code=${code}`);
            details.push(`version=${this.version}`);
            if (details.length) {
                message += " (" + details.join(", ") + ")";
            }
        }
        const create = ErrorConstructors[code] || Error;
        const error = (new create(message));
        defineReadOnly(error, "code", code);
        if (info) {
            for (const key in info) {
                defineReadOnly(error, key, (info[key]));
            }
        }
        return error;
    }
    throwError(message, code, info) {
        throw this.makeError(message, code, info);
    }
    throwArgumentError(message, name, value) {
        return this.throwError(message, "INVALID_ARGUMENT", {
            argument: name,
            value: value
        });
    }
    assert(condition, message, code, info) {
        if (!!condition) {
            return;
        }
        this.throwError(message, code || "UNKNOWN_ERROR", info);
    }
    assertArgument(condition, message, name, value) {
        return this.assert(condition, message, "INVALID_ARGUMENT", {
            argument: name,
            value
        });
    }
    assertIntegerArgument(name, value, lower, upper) {
        let message = null;
        if (typeof (value) !== "number") {
            message = "expected a number";
        }
        else if (!Number.isInteger(value)) {
            message = "invalid integer";
        }
        else if ((lower != null && value < lower) || (upper != null && value > upper)) {
            message = "value is out of range";
        }
        if (message) {
            this.throwArgumentError(message, name, value);
        }
    }
    assertSafeUint53(value, message) {
        this.assertArgument((typeof (value) === "number"), "invalid number", "value", value);
        if (message == null) {
            message = "value not safe";
        }
        const operation = "assertSafeInteger";
        this.assert((value >= 0 && value < 0x1fffffffffffff), message, "NUMERIC_FAULT", {
            operation, fault: "out-of-safe-range", value
        });
        this.assert((value % 1) === 0, message, "NUMERIC_FAULT", {
            operation, fault: "non-integer", value
        });
    }
    assertNormalize(form) {
        if (_normalizeForms.indexOf(form) === -1) {
            this.throwError("platform missing String.prototype.normalize", "UNSUPPORTED_OPERATION", {
                operation: "String.prototype.normalize", info: { form }
            });
        }
    }
    assertPrivate(givenGuard, guard, className = "") {
        if (givenGuard !== guard) {
            let method = className, operation = "new";
            if (className) {
                method += ".";
                operation += " " + className;
            }
            this.throwError(`private constructor; use ${method}from* methods`, "UNSUPPORTED_OPERATION", {
                operation
            });
        }
    }
    assertArgumentCount(count, expectedCount, message = "") {
        if (message) {
            message = ": " + message;
        }
        this.assert((count >= expectedCount), "missing arguemnt" + message, "MISSING_ARGUMENT", {
            count: count,
            expectedCount: expectedCount
        });
        this.assert((count >= expectedCount), "too many arguemnts" + message, "UNEXPECTED_ARGUMENT", {
            count: count,
            expectedCount: expectedCount
        });
    }
    #getBytes(value, name, copy) {
        if (value instanceof Uint8Array) {
            if (copy) {
                return new Uint8Array(value);
            }
            return value;
        }
        if (typeof (value) === "string" && value.match(/^0x([0-9a-f][0-9a-f])*$/i)) {
            const result = new Uint8Array((value.length - 2) / 2);
            let offset = 2;
            for (let i = 0; i < result.length; i++) {
                result[i] = parseInt(value.substring(offset, offset + 2), 16);
                offset += 2;
            }
            return result;
        }
        return this.throwArgumentError("invalid BytesLike value", name || "value", value);
    }
    getBytes(value, name) {
        return this.#getBytes(value, name, false);
    }
    getBytesCopy(value, name) {
        return this.#getBytes(value, name, true);
    }
    getNumber(value, name) {
        switch (typeof (value)) {
            case "bigint":
                if (value < -maxValue || value > maxValue) {
                    this.throwArgumentError("overflow", name || "value", value);
                }
                return Number(value);
            case "number":
                if (!Number.isInteger(value)) {
                    this.throwArgumentError("underflow", name || "value", value);
                }
                else if (value < -maxValue || value > maxValue) {
                    this.throwArgumentError("overflow", name || "value", value);
                }
                return value;
            case "string":
                try {
                    return this.getNumber(BigInt(value), name);
                }
                catch (e) {
                    this.throwArgumentError(`invalid numeric string: ${e.message}`, name || "value", value);
                }
        }
        return this.throwArgumentError("invalid numeric value", name || "value", value);
    }
    getBigInt(value, name) {
        switch (typeof (value)) {
            case "bigint": return value;
            case "number":
                if (!Number.isInteger(value)) {
                    this.throwArgumentError("underflow", name || "value", value);
                }
                else if (value < -maxValue || value > maxValue) {
                    this.throwArgumentError("overflow", name || "value", value);
                }
                return BigInt(value);
            case "string":
                try {
                    return BigInt(value);
                }
                catch (e) {
                    this.throwArgumentError(`invalid BigNumberish string: ${e.message}`, name || "value", value);
                }
        }
        return this.throwArgumentError("invalid BigNumberish value", name || "value", value);
    }
    #log(logLevel, args) {
        const level = logLevel.toLowerCase();
        if (LogLevels[level] == null) {
            this.throwArgumentError("invalid log level name", "logLevel", logLevel);
        }
        if (_logLevel > LogLevels[level]) {
            return;
        }
        console.log.apply(console, args);
    }
    debug(...args) {
        this.#log(LogLevel.DEBUG, args);
    }
    info(...args) {
        this.#log(LogLevel.INFO, args);
    }
    warn(...args) {
        this.#log(LogLevel.WARNING, args);
    }
    static globalLogger() {
        if (!_globalLogger) {
            _globalLogger = new Logger(version);
        }
        return _globalLogger;
    }
    static setLogLevel(logLevel) {
        const level = LogLevels[logLevel.toLowerCase()];
        if (level == null) {
            Logger.globalLogger().warn("invalid log level - " + logLevel);
            return;
        }
        _logLevel = level;
    }
}
