"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { getContactAvatar } from "@/lib/chat-api";
import { CONTACT_AVATAR_FAILED, CONTACT_AVATAR_UPDATED, type ContactAvatarEvent } from "@/lib/contact-avatar-events";
import type { Contact } from "@/types/chat";

const RETRY_INTERVAL = 60_000;

export function useContactAvatars(
  contacts: Contact[],
  setContacts: Dispatch<SetStateAction<Contact[]>>,
  setSelectedContact: Dispatch<SetStateAction<Contact | null>>,
) {
  const attempts = useRef(new Map<number, number>());
  const pending = useRef(new Set<number>());
  const failed = useRef(new Set<number>());
  const contactsRef = useRef(contacts);
  const retryRef = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;

    function load(contact: Contact, refresh: boolean) {
      const lastAttempt = attempts.current.get(contact.id);
      if (pending.current.size >= 4 || pending.current.has(contact.id) || (lastAttempt !== undefined && Date.now() - lastAttempt < RETRY_INTERVAL)) return;
      attempts.current.set(contact.id, Date.now());
      pending.current.add(contact.id);

      void getContactAvatar(contact.id, refresh)
        .then(({ profilePictureUrl }) => {
          if (!active || !profilePictureUrl) return;
          failed.current.delete(contact.id);
          const update = (item: Contact) => item.id === contact.id ? { ...item, profilePictureUrl } : item;
          setContacts((current) => current.map(update));
          setSelectedContact((current) => current ? update(current) : current);
          // Permite tentar a imagem novamente mesmo se o provedor devolver a mesma URL.
          window.dispatchEvent(new CustomEvent(CONTACT_AVATAR_UPDATED, { detail: { contactId: contact.id } }));
        })
        .catch(() => {
          // Uma falha temporária será tentada novamente no próximo intervalo.
        })
        .finally(() => {
          pending.current.delete(contact.id);
          if (active) retryRef.current();
        });
    }

    function retry() {
      for (const contact of contactsRef.current) {
        if (!contact.profilePictureUrl || failed.current.has(contact.id)) load(contact, failed.current.has(contact.id));
      }
    }

    function onFailed(event: Event) {
      const { contactId } = (event as ContactAvatarEvent).detail;
      failed.current.add(contactId);
      const contact = contactsRef.current.find((item) => item.id === contactId);
      if (contact) load(contact, true);
    }

    window.addEventListener(CONTACT_AVATAR_FAILED, onFailed);
    window.addEventListener("online", retry);
    const timer = window.setInterval(retry, RETRY_INTERVAL);
    retryRef.current = retry;
    retry();
    return () => {
      active = false;
      retryRef.current = () => {};
      window.clearInterval(timer);
      window.removeEventListener(CONTACT_AVATAR_FAILED, onFailed);
      window.removeEventListener("online", retry);
    };
  }, [setContacts, setSelectedContact]);

  useEffect(() => {
    contactsRef.current = contacts;
    retryRef.current();
  }, [contacts]);
}
