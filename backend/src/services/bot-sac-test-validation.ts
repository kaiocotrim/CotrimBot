export function validSacTestCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{14}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let base = digits.slice(0, 12);
  for (let size = 12; size < 14; size++) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(base[i]) * ((size - i - 1) % 8 + 2);
    const digit = 11 - sum % 11;
    base += digit >= 10 ? 0 : digit;
  }
  return base === digits;
}

export function normalizeSacTestPhone(value: string): string {
  const digits = value.replace(/[\s()+.-]/g, '');
  return digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits;
}
const ddds = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
export function validSacTestPhone(value: string): boolean {
  const digits = normalizeSacTestPhone(value);
  return ddds.has(digits.slice(0, 2)) && /^\d{2}(?:[2-5]\d{7}|9\d{8})$/.test(digits);
}
export function validSacTestName(value: string): boolean {
  return value.length <= 200 && /\p{L}/u.test(value) && !/[\r\n]/.test(value);
}
export function validSacTestEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value);
}
