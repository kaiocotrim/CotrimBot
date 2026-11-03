import { getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

export function normalizeContactPhone(value: string, country: CountryCode): { phone: string | null; error: string | null } {
  if (!value.trim()) return { phone: null, error: null };
  const callingCode = getCountryCallingCode(country);
  const enteredDigits = value.replace(/\D/g, "");
  if (value.trim().startsWith("+") && !enteredDigits.startsWith(callingCode)) {
    return { phone: null, error: `O número precisa usar o código +${callingCode} do país selecionado.` };
  }
  const digits = enteredDigits.startsWith(callingCode)
    && (value.trim().startsWith("+") || country === "BR" && enteredDigits.length >= 12)
    ? enteredDigits.slice(callingCode.length) : enteredDigits;
  if (country === "BR" && !/^\d{10,11}$/.test(digits)) return { phone: null, error: "Informe o DDD e um número de telefone válido." };
  const phone = `${callingCode}${digits}`;
  if (!parsePhoneNumberFromString(`+${phone}`)?.isPossible()) return { phone: null, error: "Informe um número de telefone válido." };
  return { phone, error: null };
}
