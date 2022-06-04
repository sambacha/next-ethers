export function isError(error, code) {
    return (error && error.code === code);
}
export function isCallException(error) {
    return isError(error, "CALL_EXCEPTION");
}
