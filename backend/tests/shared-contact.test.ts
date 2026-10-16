import assert from "node:assert/strict";
import test from "node:test";
import { extractSharedContacts } from "../src/utils/shared-contact.js";

test("extracts a forwarded WhatsApp contact, preferring the international waid", () => {
  assert.deepEqual(extractSharedContacts({ contactMessage: {
    displayName: "Kaio Cotrim",
    vcard: "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Kaio Cotrim\r\nitem1.TEL;waid=5511932075075:+55 (11) 93207-5075\r\nEND:VCARD",
  } }), [{ name: "Kaio Cotrim", phone: "5511932075075" }]);
});

test("supports multiple cards, folded names, escaping and multiple numbers", () => {
  assert.deepEqual(extractSharedContacts({ ephemeralMessage: { message: { contactsArrayMessage: { contacts: [
    { vcard: "FN:Ana\\, Maria\r\n Silva\r\nTEL;VALUE=uri:tel:+55-11-99999-0000;ext=12\r\nTEL:+55 11 3333-4444" },
    { displayName: "Bruno", vcard: "TEL:+55 21 98888-7777" },
    { displayName: "Bruno", vcard: "TEL:+55 21 98888-7777" },
  ] } } } }), [
    { name: "Ana, MariaSilva", phone: "5511999990000" },
    { name: "Ana, MariaSilva", phone: "551133334444" },
    { name: "Bruno", phone: "5521988887777" },
  ]);
});

test("ignores invalid numbers, excessive cards and unrelated or malformed payloads", () => {
  assert.deepEqual(extractSharedContacts({ conversation: "TEL:5511999999999" }), []);
  assert.deepEqual(extractSharedContacts({ contactMessage: { vcard: "FN:Invalid\nTEL:123\nTEL:1234567890123456" } }), []);
  assert.deepEqual(extractSharedContacts({ contactsArrayMessage: { contacts: [null, {}, { vcard: 42 }] } }), []);
  const cards = Array.from({ length: 101 }, (_, index) => ({ vcard: `FN:Person ${index}\nTEL:5511${String(index).padStart(9, "0")}` }));
  assert.equal(extractSharedContacts({ contactsArrayMessage: { contacts: cards } }).length, 100);
});
