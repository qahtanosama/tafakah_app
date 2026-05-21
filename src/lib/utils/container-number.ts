// ISO 6346 container numbers are 4 letters (owner + category) + 7 digits.
// e.g. MSKU1234567, TCNU7654321. The last digit is technically a checksum,
// but we only enforce the surface format — checksum validation is over-eager
// for typo prevention.
const CONTAINER_REGEX = /^[A-Z]{4}\d{7}$/;

export function isValidContainerNumber(value: string): boolean {
  return CONTAINER_REGEX.test(value.trim().toUpperCase());
}

export function normalizeContainerNumber(value: string): string {
  return value.trim().toUpperCase();
}
